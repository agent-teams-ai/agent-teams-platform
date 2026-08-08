import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";

import YAML from "yaml";

import { validatePlatformDomain } from "./validate-platform-domain.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const execFileAsync = promisify(execFile);
const foundationCli = path.join(
  repositoryRoot,
  "node_modules/@agent-teams/engineering-foundation/dist/cli.js",
);

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "platform-domain-"));
  await mkdir(path.join(root, "architecture/foundation"), { recursive: true });
  await cp(
    path.join(repositoryRoot, "architecture/package-catalog.yaml"),
    path.join(root, "architecture/package-catalog.yaml"),
  );
  await cp(
    path.join(repositoryRoot, "architecture/foundation/scaffolding.yaml"),
    path.join(root, "architecture/foundation/scaffolding.yaml"),
  );
  await cp(path.join(repositoryRoot, "docs/domain"), path.join(root, "docs/domain"), {
    recursive: true,
  });
  return root;
}

async function editYaml(root, relativePath, mutate) {
  const file = path.join(root, relativePath);
  const value = YAML.parse(await readFile(file, "utf8"));
  mutate(value);
  await writeFile(file, YAML.stringify(value));
}

async function writeProjectManagementIntent(root) {
  const relativePath = "architecture/foundation/project-management.intent.yaml";
  await writeFile(
    path.join(root, relativePath),
    YAML.stringify({
      schemaVersion: 1,
      compositionId: "platform-private-context",
      targetRef: "context.project-management",
    }),
  );
  return relativePath;
}

async function planFixture(root, intentPath) {
  return execFileAsync(
    process.execPath,
    [foundationCli, "scaffold-plan", intentPath, "--consumer", root, "--json"],
    { cwd: root },
  );
}

test("accepts the canonical proposed Platform domain plan", async () => {
  assert.deepEqual(await validatePlatformDomain(repositoryRoot), []);
});

test("Foundation rejects planning for a proposed owner", async () => {
  const root = await fixture();
  try {
    const intent = await writeProjectManagementIntent(root);
    await assert.rejects(
      planFixture(root, intent),
      /Owner document status is not admitted/u,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("Foundation compiles the reserved package after owner acceptance", async () => {
  const root = await fixture();
  try {
    const dossier = path.join(
      root,
      "docs/domain/contexts/project-management/README.md",
    );
    const source = await readFile(dossier, "utf8");
    await writeFile(dossier, source.replace("status: proposed", "status: accepted"));
    const intent = await writeProjectManagementIntent(root);
    const { stdout } = await planFixture(root, intent);
    const plan = JSON.parse(stdout);
    assert.equal(plan.target.id, "context.project-management");
    assert.deepEqual(
      plan.operations.map((operation) => operation.path),
      [
        "packages/contexts/project-management/package.json",
        "packages/contexts/project-management/src/index.ts",
        "packages/contexts/project-management/tsconfig.json",
      ],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects duplicate package identities", async () => {
  const root = await fixture();
  try {
    await editYaml(root, "architecture/package-catalog.yaml", (catalog) => {
      catalog.packages.push({ ...catalog.packages[0] });
    });
    assert.match(
      (await validatePlatformDomain(root)).join("\n"),
      /DOMAIN-CATALOG-001 duplicate id/u,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects a dossier bound to the wrong package target", async () => {
  const root = await fixture();
  try {
    const dossier = path.join(
      root,
      "docs/domain/contexts/project-management/README.md",
    );
    const source = await readFile(dossier, "utf8");
    await writeFile(
      dossier,
      source.replace(
        "package_target: context.project-management",
        "package_target: context.tenancy",
      ),
    );
    assert.match(
      (await validatePlatformDomain(root)).join("\n"),
      /DOMAIN-CATALOG-004/u,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects materialization under a proposed owner", async () => {
  const root = await fixture();
  try {
    await mkdir(path.join(root, "packages/contexts/project-management"), {
      recursive: true,
    });
    assert.match(
      (await validatePlatformDomain(root)).join("\n"),
      /DOMAIN-MATERIALIZE-001/u,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("requires an accepted owner and package to land together", async () => {
  const root = await fixture();
  try {
    const dossier = path.join(root, "docs/domain/contexts/tenancy/README.md");
    const source = await readFile(dossier, "utf8");
    await writeFile(dossier, source.replace("status: proposed", "status: accepted"));
    assert.match(
      (await validatePlatformDomain(root)).join("\n"),
      /DOMAIN-MATERIALIZE-002/u,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
