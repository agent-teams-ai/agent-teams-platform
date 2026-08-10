import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";

import YAML from "yaml";

import { validatePlatformDomain } from "./validate-platform-domain.mjs";
import { validatePlatformPackageManifest } from "./platform-domain-materialization.mjs";
import { reproduciblePlanProjection } from "./platform-domain-scaffold-evidence.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const execFileAsync = promisify(execFile);
const foundationCli = path.join(
  repositoryRoot,
  "node_modules/@agent-teams/engineering-foundation/dist/cli.js",
);
const projectDossierPath = "docs/domain/contexts/project-management/README.md";
const productDecisionPacketPath = "docs/domain/product-decision-packet.md";
const packagePath = "packages/contexts/project-management";
const decisionId = "ADR-9999";
const decisionPath = "docs/decisions/9999-accept-project-management.md";

test("reproduction preserves immutable plans across compiler upgrades", () => {
  const plan = {
    compiler: {
      id: "@agent-teams/engineering-foundation",
      version: "0.9.0",
    },
    operations: [{ id: "materialize/example" }],
  };
  const upgraded = structuredClone(plan);
  upgraded.compiler.version = "0.10.0";
  assert.deepEqual(
    reproduciblePlanProjection(plan),
    reproduciblePlanProjection(upgraded),
  );
  upgraded.compiler.id = "other-compiler";
  assert.notDeepEqual(
    reproduciblePlanProjection(plan),
    reproduciblePlanProjection(upgraded),
  );
});

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "platform-domain-"));
  await mkdir(path.join(root, "architecture/decisions"), { recursive: true });
  for (const relativePath of [
    "architecture/package-catalog.yaml",
    "architecture/decisions/accepted-decisions.json",
    "foundation.config.yaml",
  ]) {
    await cp(path.join(repositoryRoot, relativePath), path.join(root, relativePath));
  }
  await cp(
    path.join(repositoryRoot, "architecture/foundation"),
    path.join(root, "architecture/foundation"),
    { recursive: true },
  );
  await cp(path.join(repositoryRoot, "docs/domain"), path.join(root, "docs/domain"), {
    recursive: true,
  });
  await cp(
    path.join(repositoryRoot, "docs/decisions"),
    path.join(root, "docs/decisions"),
    { recursive: true },
  );
  const projectDossierFile = path.join(root, projectDossierPath);
  const projectDossier = await readFile(projectDossierFile, "utf8");
  await writeFile(
    projectDossierFile,
    projectDossier
      .replace("status: accepted", "status: proposed")
      .replace("owner_decision: ADR-0007\n", "")
      .replace("first_feature: managed-project-scope-admission\n", ""),
  );
  return root;
}

async function withFixture(run) {
  const root = await fixture();
  try {
    await run(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

async function editYaml(root, relativePath, mutate) {
  const file = path.join(root, relativePath);
  const value = YAML.parse(await readFile(file, "utf8"));
  mutate(value);
  await writeFile(file, YAML.stringify(value));
}

async function writeProjectManagementIntent(root) {
  const relativePath =
    "architecture/scaffolding/intents/context.project-management.yaml";
  await mkdir(path.join(root, path.dirname(relativePath)), { recursive: true });
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

async function acceptProjectManagement(root) {
  const decision = `---
id: ${decisionId}
type: adr
status: accepted
owner: product/project-management
summary: Accept the first Project Management package target.
approved_by: product-owner
accepted_at: 2026-08-08
accepts_package_targets:
  - context.project-management
---

# ${decisionId}: Accept Project Management

Accept the package target together with its first feature slice.
  `;
  await writeFile(path.join(root, decisionPath), decision);
  const indexFile = path.join(root, "docs/decisions/README.md");
  const index = await readFile(indexFile, "utf8");
  await writeFile(
    indexFile,
    index.replace(
      "\n## Superseded Decisions\n",
      `\n- [${decisionId}: Accept Project Management](9999-accept-project-management.md)\n\n## Superseded Decisions\n`,
    ),
  );
  await execFileAsync(
    process.execPath,
    [
      foundationCli,
      "architecture-decisions-promote-baseline",
      "--consumer",
      root,
      "--json",
    ],
    { cwd: root },
  );

  const dossierFile = path.join(root, projectDossierPath);
  const dossier = await readFile(dossierFile, "utf8");
  await writeFile(
    dossierFile,
    dossier
      .replace(
        "status: proposed",
        `status: accepted\nowner_decision: ${decisionId}\nfirst_feature: managed-project-scope-admission`,
      )
      .replace("related:\n", `related:\n  - ${decisionId}\n`),
  );
}

async function materializeProjectManagement(root) {
  const intentPath = await writeProjectManagementIntent(root);
  const { stdout: planOutput } = await planFixture(root, intentPath);
  const plan = JSON.parse(planOutput);
  const planPath = "architecture/scaffolding/plans/context.project-management.json";
  const receiptPath =
    "architecture/scaffolding/receipts/context.project-management.json";
  await mkdir(path.join(root, path.dirname(planPath)), { recursive: true });
  await mkdir(path.join(root, path.dirname(receiptPath)), { recursive: true });
  await writeFile(path.join(root, planPath), `${JSON.stringify(plan, null, 2)}\n`);
  const { stdout: receiptOutput } = await execFileAsync(
    process.execPath,
    [foundationCli, "scaffold-apply", planPath, "--consumer", root, "--json"],
    { cwd: root },
  );
  await writeFile(
    path.join(root, receiptPath),
    `${JSON.stringify(JSON.parse(receiptOutput), null, 2)}\n`,
  );
  const { stdout: replayOutput } = await execFileAsync(
    process.execPath,
    [foundationCli, "scaffold-apply", planPath, "--consumer", root, "--json"],
    { cwd: root },
  );
  assert.equal(JSON.parse(replayOutput).outcome, "already-applied");
  const featurePath = `${packagePath}/src/features/managed-project-scope-admission`;
  await mkdir(path.join(root, featurePath), { recursive: true });
  const manifestFile = path.join(root, packagePath, "package.json");
  const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  manifest.exports["./composition"] = {
    types: "./dist/composition.d.ts",
    import: "./dist/composition.js",
  };
  manifest.exports["./worker"] = {
    types: "./dist/worker.d.ts",
    import: "./dist/worker.js",
  };
  manifest.exports["./testing/model-conformance"] = {
    types:
      "./dist/features/managed-project-scope-admission/__tests__/model-conformance-fixture.d.ts",
    import:
      "./dist/features/managed-project-scope-admission/__tests__/model-conformance-fixture.js",
  };
  manifest.scripts.test =
    "node --test --test-concurrency=1 'dist/**/*.test.js'";
  await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  for (const [surface, featureSurface] of [
    ["index", "public"],
    ["composition", "composition"],
    ["worker", "worker"],
  ]) {
    await writeFile(
      path.join(root, packagePath, `src/${surface}.ts`),
      `export * from "./features/managed-project-scope-admission/${featureSurface}.js";\n`,
    );
    await writeFile(
      path.join(root, featurePath, `${featureSurface}.ts`),
      featureSurface === "public"
        ? await readFile(
            path.join(
              repositoryRoot,
              packagePath,
              "src/features/managed-project-scope-admission/public.ts",
            ),
            "utf8",
          )
        : "export {};\n",
    );
  }
  await writeFile(
    path.join(root, featurePath, "admit-project-scope.ts"),
    "export const admitProjectScope = () => 'accepted';\n",
  );
  await writeFile(
    path.join(root, featurePath, "admit-project-scope.test.ts"),
    `import assert from "node:assert/strict";\nimport test from "node:test";\n\ntest("admits a project scope", () => {\n  assert.equal("accepted", "accepted");\n});\n`,
  );
  return plan;
}

async function validationText(root) {
  return (await validatePlatformDomain(root)).join("\n");
}

test("accepts the canonical Platform domain plan", async () => {
  assert.deepEqual(await validatePlatformDomain(repositoryRoot), []);
});

test("accepts the Project Management model-conformance testing export", async () => {
  const target = YAML.parse(
    await readFile(path.join(repositoryRoot, "architecture/package-catalog.yaml"), "utf8"),
  ).packages.find(({ id }) => id === "context.project-management");
  assert.deepEqual(
    await validatePlatformPackageManifest(repositoryRoot, target),
    [],
  );
});

test("rejects a Project Management manifest without its testing export", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "platform-package-export-"));
  try {
    await mkdir(path.join(root, packagePath), { recursive: true });
    const manifest = JSON.parse(
      await readFile(path.join(repositoryRoot, packagePath, "package.json"), "utf8"),
    );
    delete manifest.exports["./testing/model-conformance"];
    await writeFile(
      path.join(root, packagePath, "package.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    const target = YAML.parse(
      await readFile(
        path.join(repositoryRoot, "architecture/package-catalog.yaml"),
        "utf8",
      ),
    ).packages.find(({ id }) => id === "context.project-management");
    assert.deepEqual(await validatePlatformPackageManifest(root, target), [
      `DOMAIN-PACKAGE-002 invalid package envelope: ${packagePath}/package.json`,
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("Foundation rejects planning for a proposed owner", async () => {
  await withFixture(async (root) => {
    const intent = await writeProjectManagementIntent(root);
    await assert.rejects(planFixture(root, intent), /Owner document status is not admitted/u);
  });
});

test("Foundation recovers a partially published Platform package transaction", async () => {
  await withFixture(async (root) => {
    await acceptProjectManagement(root);
    const intent = await writeProjectManagementIntent(root);
    const { stdout } = await planFixture(root, intent);
    const plan = JSON.parse(stdout);
    const stateRoot = path.join(root, ".agent-teams-local");
    const journalFile = path.join(stateRoot, "scaffolding-transaction.json");
    await mkdir(stateRoot, { recursive: true });
    const publishedOperation = plan.operations[0];
    await mkdir(path.dirname(path.join(root, publishedOperation.path)), {
      recursive: true,
    });
    await writeFile(
      path.join(root, publishedOperation.path),
      Buffer.from(publishedOperation.after.contentBase64, "base64"),
    );
    await writeFile(
      journalFile,
      `${JSON.stringify({
        schemaVersion: 1,
        state: "PREPARED",
        plan,
        operations: plan.operations.map((operation, index) => ({
          operationId: operation.id,
          path: operation.path,
          state: index === 0 ? "published" : "pending",
        })),
      }, null, 2)}\n`,
    );
    const { stdout: recoveryOutput } = await execFileAsync(
      process.execPath,
      [foundationCli, "scaffold-recover", "--consumer", root, "--json"],
      { cwd: root },
    );
    const receipt = JSON.parse(recoveryOutput);
    assert.equal(receipt.commit.state, "recovered");
    assert.equal(
      await readFile(path.join(root, packagePath, "package.json"), "utf8")
        .then((source) => JSON.parse(source).name),
      "@agent-teams/platform-project-management",
    );
    await assert.rejects(readFile(journalFile, "utf8"), /ENOENT/u);
  });
});

test("rejects a dossier status flip without an explicit accepted ADR", async () => {
  await withFixture(async (root) => {
    const dossierFile = path.join(root, projectDossierPath);
    const dossier = await readFile(dossierFile, "utf8");
    await writeFile(dossierFile, dossier.replace("status: proposed", "status: accepted"));
    assert.match(await validationText(root), /DOMAIN-DECISION-001/u);
  });
});

test("accepts an ADR-bound Foundation materialization with a real feature", async () => {
  await withFixture(async (root) => {
    await acceptProjectManagement(root);
    const plan = await materializeProjectManagement(root);
    assert.equal(plan.target.id, "context.project-management");
    const manifest = JSON.parse(
      await readFile(path.join(root, packagePath, "package.json"), "utf8"),
    );
    assert.deepEqual(manifest.exports["./testing/model-conformance"], {
      types:
        "./dist/features/managed-project-scope-admission/__tests__/model-conformance-fixture.d.ts",
      import:
        "./dist/features/managed-project-scope-admission/__tests__/model-conformance-fixture.js",
    });
    assert.deepEqual(await validatePlatformDomain(root), []);
  });
});

test("rejects materialization without the model-conformance testing export", async () => {
  await withFixture(async (root) => {
    await acceptProjectManagement(root);
    await materializeProjectManagement(root);
    const manifestFile = path.join(root, packagePath, "package.json");
    const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
    delete manifest.exports["./testing/model-conformance"];
    await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
    assert.match(await validationText(root), /DOMAIN-PACKAGE-002/u);
  });
});

test("rejects an accepted but empty package directory", async () => {
  await withFixture(async (root) => {
    await acceptProjectManagement(root);
    await mkdir(path.join(root, packagePath), { recursive: true });
    assert.match(await validationText(root), /DOMAIN-PACKAGE-001/u);
  });
});

test("keeps Plan evidence historical while live owner validation evolves", async () => {
  await withFixture(async (root) => {
    await acceptProjectManagement(root);
    await materializeProjectManagement(root);
    const dossierFile = path.join(root, projectDossierPath);
    await writeFile(dossierFile, `${await readFile(dossierFile, "utf8")}\n`);
    assert.deepEqual(await validatePlatformDomain(root), []);
  });
});

test("accepts Foundation-normalized CRLF authority inputs", async () => {
  await withFixture(async (root) => {
    await acceptProjectManagement(root);
    const dossierFile = path.join(root, projectDossierPath);
    const dossier = await readFile(dossierFile, "utf8");
    await writeFile(dossierFile, dossier.replaceAll("\n", "\r\n"));
    await materializeProjectManagement(root);
    assert.deepEqual(await validatePlatformDomain(root), []);
  });
});

test("rejects empty implementation and test files in the first feature", async () => {
  await withFixture(async (root) => {
    await acceptProjectManagement(root);
    await materializeProjectManagement(root);
    const featurePath = `${packagePath}/src/features/managed-project-scope-admission`;
    await writeFile(path.join(root, featurePath, "admit-project-scope.ts"), "");
    await writeFile(path.join(root, featurePath, "admit-project-scope.test.ts"), "");
    assert.match(await validationText(root), /DOMAIN-PACKAGE-006/u);
  });
});

test("requires every accepted package to expose and run its check script", async () => {
  await withFixture(async (root) => {
    await acceptProjectManagement(root);
    await materializeProjectManagement(root);
    const manifestFile = path.join(root, packagePath, "package.json");
    const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
    delete manifest.scripts.check;
    await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
    assert.match(await validationText(root), /DOMAIN-PACKAGE-002/u);
  });
});

test("rejects a package check script that is only a successful no-op", async () => {
  await withFixture(async (root) => {
    await acceptProjectManagement(root);
    await materializeProjectManagement(root);
    const manifestFile = path.join(root, packagePath, "package.json");
    const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
    manifest.scripts.check = "true";
    await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
    assert.match(await validationText(root), /DOMAIN-PACKAGE-002/u);
  });
});

test("rejects a package test script that disables test execution", async () => {
  await withFixture(async (root) => {
    await acceptProjectManagement(root);
    await materializeProjectManagement(root);
    const manifestFile = path.join(root, packagePath, "package.json");
    const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
    manifest.scripts.test = "true";
    await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
    assert.match(await validationText(root), /DOMAIN-PACKAGE-002/u);
  });
});

test("rejects a package root that leaks composition through the public surface", async () => {
  await withFixture(async (root) => {
    await acceptProjectManagement(root);
    await materializeProjectManagement(root);
    await writeFile(
      path.join(root, packagePath, "src/index.ts"),
      "export * from './composition.js';\n",
    );
    assert.match(await validationText(root), /DOMAIN-PACKAGE-007/u);
  });
});

test("rejects a feature public surface that exports internal application ports", async () => {
  await withFixture(async (root) => {
    await acceptProjectManagement(root);
    await materializeProjectManagement(root);
    await writeFile(
      path.join(
        root,
        packagePath,
        "src/features/managed-project-scope-admission/public.ts",
      ),
      'export type { ProjectManagementStore } from "./application/ports/project-management-store.js";\n',
    );
    assert.match(await validationText(root), /DOMAIN-PACKAGE-008/u);
  });
});

test("rejects direct public declarations that bypass the export allowlist", async () => {
  await withFixture(async (root) => {
    await acceptProjectManagement(root);
    await materializeProjectManagement(root);
    const publicFile = path.join(
      root,
      packagePath,
      "src/features/managed-project-scope-admission/public.ts",
    );
    await writeFile(
      publicFile,
      `${await readFile(publicFile, "utf8")}\nexport type InternalStore = import("./application/ports/project-management-store.js").ProjectManagementStore;\n`,
    );
    assert.match(await validationText(root), /DOMAIN-PACKAGE-009/u);
  });
});

test("rejects orphan scaffold evidence before it becomes immutable history", async () => {
  await withFixture(async (root) => {
    await acceptProjectManagement(root);
    await materializeProjectManagement(root);
    await writeFile(
      path.join(root, "architecture/scaffolding/plans/orphan.json"),
      "{}\n",
    );
    assert.match(await validationText(root), /DOMAIN-PLAN-007/u);
  });
});

test("reproduces committed scaffold operations from the canonical intent", async () => {
  await withFixture(async (root) => {
    await acceptProjectManagement(root);
    await materializeProjectManagement(root);
    await writeFile(
      path.join(
        root,
        "architecture/scaffolding/intents/context.project-management.yaml",
      ),
      YAML.stringify({
        schemaVersion: 1,
        compositionId: "missing-composition",
        targetRef: "context.project-management",
      }),
    );
    assert.match(await validationText(root), /DOMAIN-PLAN-006/u);
  });
});

test("requires every accepted context package to be dependency-governed", async () => {
  await withFixture(async (root) => {
    await acceptProjectManagement(root);
    await materializeProjectManagement(root);
    await editYaml(
      root,
      "architecture/foundation/source-dependencies.yaml",
      (config) => {
        config.governedRoots = [];
      },
    );
    assert.match(await validationText(root), /DOMAIN-BOUNDARY-001/u);
  });
});

test("rejects a test-named file without an executable test registration", async () => {
  await withFixture(async (root) => {
    await acceptProjectManagement(root);
    await materializeProjectManagement(root);
    const testFile = path.join(
      root,
      packagePath,
      "src/features/managed-project-scope-admission/admit-project-scope.test.ts",
    );
    await writeFile(testFile, "export const expectedAdmission = 'accepted';\n");
    assert.match(await validationText(root), /DOMAIN-PACKAGE-006/u);
  });
});

test("rejects duplicate package identities", async () => {
  await withFixture(async (root) => {
    await editYaml(root, "architecture/package-catalog.yaml", (catalog) => {
      catalog.packages.push({ ...catalog.packages[0] });
    });
    assert.match(await validationText(root), /DOMAIN-CATALOG-001 duplicate id/u);
  });
});

test("rejects duplicate dossier identities", async () => {
  await withFixture(async (root) => {
    const dossierFile = path.join(root, "docs/domain/contexts/tenancy/README.md");
    const dossier = await readFile(dossierFile, "utf8");
    await writeFile(
      dossierFile,
      dossier.replace(
        "id: domain.contexts.tenancy",
        "id: domain.contexts.customer-ownership",
      ),
    );
    assert.match(await validationText(root), /DOMAIN-DOSSIER-001 duplicate id/u);
  });
});

test("rejects a dossier bound to the wrong package target", async () => {
  await withFixture(async (root) => {
    const dossierFile = path.join(root, projectDossierPath);
    const dossier = await readFile(dossierFile, "utf8");
    await writeFile(
      dossierFile,
      dossier.replace(
        "package_target: context.project-management",
        "package_target: context.tenancy",
      ),
    );
    assert.match(await validationText(root), /DOMAIN-CATALOG-004/u);
  });
});

test("rejects materialization under a proposed owner", async () => {
  await withFixture(async (root) => {
    await mkdir(path.join(root, packagePath), { recursive: true });
    assert.match(await validationText(root), /DOMAIN-MATERIALIZE-001/u);
  });
});

test("rejects symlinked and uncatalogued context packages", async () => {
  await withFixture(async (root) => {
    await mkdir(path.join(root, "packages/contexts"), { recursive: true });
    await symlink(
      path.join(root, "docs/domain/contexts/project-management"),
      path.join(root, packagePath),
      "dir",
    );
    await mkdir(path.join(root, "packages/contexts/rogue"));
    const errors = await validationText(root);
    assert.match(errors, /DOMAIN-MATERIALIZE-003/u);
    assert.match(errors, /DOMAIN-MATERIALIZE-005/u);
  });
});

test("rejects a symlink nested inside an accepted context package", async () => {
  await withFixture(async (root) => {
    await acceptProjectManagement(root);
    await materializeProjectManagement(root);
    await symlink(
      path.join(root, "docs/domain/context-map.md"),
      path.join(root, packagePath, "src/features/external.ts"),
    );
    assert.match(await validationText(root), /DOMAIN-PACKAGE-003/u);
  });
});

test("rejects scaffold evidence reached through a symlinked parent", async () => {
  await withFixture(async (root) => {
    await acceptProjectManagement(root);
    await materializeProjectManagement(root);
    const plans = path.join(root, "architecture/scaffolding/plans");
    const movedPlans = path.join(root, "architecture/scaffolding/materialized-plans");
    await rename(plans, movedPlans);
    await symlink(movedPlans, plans, "dir");
    assert.match(await validationText(root), /DOMAIN-PLAN-002/u);
  });
});

test("does not accept mandatory headings hidden in a Markdown code block", async () => {
  await withFixture(async (root) => {
    const dossierFile = path.join(root, projectDossierPath);
    const dossier = await readFile(dossierFile, "utf8");
    await writeFile(
      dossierFile,
      dossier.replace("\n## Invariants\n", "\n```markdown\n## Invariants\n```\n"),
    );
    assert.match(await validationText(root), /DOMAIN-DOSSIER-005.*Invariants/u);
  });
});

test("does not accept mandatory headings nested inside a blockquote", async () => {
  await withFixture(async (root) => {
    const dossierFile = path.join(root, projectDossierPath);
    const dossier = await readFile(dossierFile, "utf8");
    await writeFile(
      dossierFile,
      dossier.replace("\n## Invariants\n", "\n> ## Invariants\n"),
    );
    assert.match(await validationText(root), /DOMAIN-DOSSIER-005.*Invariants/u);
  });
});

test("rejects regression of an accepted product decision", async () => {
  await withFixture(async (root) => {
    const packetFile = path.join(root, productDecisionPacketPath);
    const packet = await readFile(packetFile, "utf8");
    await writeFile(
      packetFile,
      packet.replace(
        "  PO-PLAT-003: accepted",
        "  PO-PLAT-003: awaiting-product-owner",
      ),
    );
    assert.match(await validationText(root), /DOMAIN-PO-003 PO-PLAT-003/u);
  });
});

test("rejects a product packet bound to a different decision", async () => {
  await withFixture(async (root) => {
    const packetFile = path.join(root, productDecisionPacketPath);
    const packet = await readFile(packetFile, "utf8");
    await writeFile(
      packetFile,
      packet.replace("owner_decision: ADR-0007", "owner_decision: ADR-9999"),
    );
    assert.match(await validationText(root), /DOMAIN-PO-001/u);
  });
});

test("rejects an incomplete product-decision resolution", async () => {
  await withFixture(async (root) => {
    const resolutionFile = path.join(
      root,
      "docs/decisions/0007-platform-strategic-context-map-and-first-project-management-slice.md",
    );
    const resolution = await readFile(resolutionFile, "utf8");
    await writeFile(
      resolutionFile,
      resolution.replace("  - PO-PLAT-007\n", ""),
    );
    assert.match(await validationText(root), /DOMAIN-PO-006/u);
  });
});

test("requires each product decision exactly once", async () => {
  await withFixture(async (root) => {
    const packetFile = path.join(root, productDecisionPacketPath);
    const packet = await readFile(packetFile, "utf8");
    await writeFile(
      packetFile,
      packet.replace(
        "## PO-PLAT-007: ProductProject Naming",
        "## PO-PLAT-006: ProductProject Naming",
      ),
    );
    assert.match(await validationText(root), /DOMAIN-PO-004/u);
  });
});

test("does not accept product-decision sections nested inside a blockquote", async () => {
  await withFixture(async (root) => {
    const packetFile = path.join(root, productDecisionPacketPath);
    const packet = await readFile(packetFile, "utf8");
    await writeFile(
      packetFile,
      packet.replace("\n### Consequences\n", "\n> ### Consequences\n"),
    );
    assert.match(
      await validationText(root),
      /DOMAIN-PO-005 PO-PLAT-001 lacks Consequences/u,
    );
  });
});
