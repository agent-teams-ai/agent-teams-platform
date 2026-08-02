import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildForbiddenProfileVocabulary,
  validateCoreSource,
  validateDeploymentProfiles,
  validateDeploymentProfileSemantics,
  validateQualificationRecordSemantics,
} from "./validate-deployment-profiles.mjs";
import { validateQualificationHistoryEntries } from "./validate-qualification-record-history.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");

function findProfile(catalog, id) {
  const profile = catalog.profiles.find((item) => item.id === id);
  assert.ok(profile, `missing fixture profile ${id}`);
  return profile;
}

test("accepts the canonical deployment profile catalog", async () => {
  const result = await validateDeploymentProfiles(repositoryRoot);
  assert.deepEqual(result.errors, []);
  assert.equal(result.catalog.profiles.length, 6);
});

test("does not confuse v1 qualification targets with current qualification", async () => {
  const result = await validateDeploymentProfiles(repositoryRoot);
  const local = findProfile(result.catalog, "local-standalone-desktop");
  assert.equal(local.currentStatus, "DESIGNED");
  assert.equal(local.v1TargetStatus, "QUALIFIED");
});

test("rejects qualified status without implementation and an active record", async () => {
  const result = await validateDeploymentProfiles(repositoryRoot);
  const catalog = structuredClone(result.catalog);
  findProfile(catalog, "local-standalone-desktop").currentStatus = "QUALIFIED";
  const errors = validateDeploymentProfileSemantics(catalog).join("\n");
  assert.match(errors, /DEPLOY-IMPLEMENTED-001/u);
  assert.match(errors, /DEPLOY-QUALIFIED-001/u);
});

test("rejects a content digest mismatch for an active qualification", async () => {
  const result = await validateDeploymentProfiles(repositoryRoot);
  const catalog = structuredClone(result.catalog);
  const local = findProfile(catalog, "local-standalone-desktop");
  local.currentStatus = "QUALIFIED";
  local.implementation = {
    adapterPackages: ["packages/integrations/local-host"],
    compositionRoot: "apps/local-host",
    evidence: ["reports/implementation/local-host.yaml"],
  };
  local.activeQualificationRef = {
    contentDigest: `sha256:${"a".repeat(64)}`,
    recordId: "qualification-local-v1",
  };
  const records = new Map([
    [
      "qualification-local-v1",
      {
        contentDigest: `sha256:${"b".repeat(64)}`,
        record: {
          reassessBy: "2099-01-01T00:00:00Z",
          profileId: "local-standalone-desktop",
        },
      },
    ],
  ]);
  assert.match(
    validateDeploymentProfileSemantics(
      catalog,
      records,
      new Date("2026-08-01T00:00:00Z"),
    ).join("\n"),
    /DEPLOY-QUALIFIED-003/u,
  );
});

test("rejects NOT_APPLICABLE for every current required gate", async () => {
  const result = await validateDeploymentProfiles(repositoryRoot);
  const assessments = result.catalog.qualificationGateCatalog.map((gate) => ({
    evidence: [],
    gateId: gate.id,
    outcome: gate.id === "offline-behavior" ? "NOT_APPLICABLE" : "PASS",
    rationale:
      gate.id === "offline-behavior" ? "Offline mode is not supported." : undefined,
  }));
  const errors = validateQualificationRecordSemantics(
    {
      assessedAt: "2026-08-01T00:00:00Z",
      assessments,
      reassessBy: "2026-09-01T00:00:00Z",
      recordId: "qualification-invalid-na",
      releaseSet: { contracts: [] },
    },
    result.catalog.qualificationGateCatalog,
  ).join("\n");
  assert.match(errors, /DEPLOY-RECORD-GATE-003/u);
  assert.match(errors, /DEPLOY-RECORD-GATE-005/u);
});

test("requires a superseding ADR for an additional v1 qualification target", async () => {
  const result = await validateDeploymentProfiles(repositoryRoot);
  const catalog = structuredClone(result.catalog);
  const dedicated = findProfile(catalog, "managed-dedicated");
  dedicated.v1Scope = "QUALIFY";
  dedicated.v1TargetStatus = "QUALIFIED";
  assert.match(
    validateDeploymentProfileSemantics(catalog).join("\n"),
    /DEPLOY-V1-004 managed-dedicated/u,
  );
});

test("rejects deletion or demotion of an accepted qualification gate", async () => {
  const result = await validateDeploymentProfiles(repositoryRoot);
  const missingCatalog = structuredClone(result.catalog);
  missingCatalog.qualificationGateCatalog =
    missingCatalog.qualificationGateCatalog.filter(
      (gate) => gate.id !== "fencing",
    );
  assert.match(
    validateDeploymentProfileSemantics(missingCatalog).join("\n"),
    /DEPLOY-GATE-001 fencing/u,
  );

  const demotedCatalog = structuredClone(result.catalog);
  const security = demotedCatalog.qualificationGateCatalog.find(
    (gate) => gate.id === "security",
  );
  security.requiredForQualification = false;
  assert.match(
    validateDeploymentProfileSemantics(demotedCatalog).join("\n"),
    /DEPLOY-GATE-002 security/u,
  );
});

test("keeps future deployment profiles designed-only until a superseding ADR", async () => {
  const result = await validateDeploymentProfiles(repositoryRoot);
  const missingCatalog = structuredClone(result.catalog);
  missingCatalog.profiles = missingCatalog.profiles.filter(
    (profile) => profile.id !== "hybrid-connected-runtime",
  );
  assert.match(
    validateDeploymentProfileSemantics(missingCatalog).join("\n"),
    /DEPLOY-PROFILE-003 hybrid-connected-runtime/u,
  );

  const promotedCatalog = structuredClone(result.catalog);
  findProfile(promotedCatalog, "managed-dedicated").currentStatus = "IMPLEMENTED";
  assert.match(
    validateDeploymentProfileSemantics(promotedCatalog).join("\n"),
    /DEPLOY-PROFILE-002 managed-dedicated/u,
  );
});

test("rejects an unknown design evidence set", async () => {
  const result = await validateDeploymentProfiles(repositoryRoot);
  const catalog = structuredClone(result.catalog);
  findProfile(catalog, "managed-byoc").designEvidenceSetId = "missing-set";
  assert.match(
    validateDeploymentProfileSemantics(catalog).join("\n"),
    /DEPLOY-DESIGNED-001 managed-byoc/u,
  );
});

test("rejects a design evidence-set inheritance cycle", async () => {
  const result = await validateDeploymentProfiles(repositoryRoot);
  const catalog = structuredClone(result.catalog);
  const baseline = catalog.designEvidenceSets.find(
    (evidenceSet) => evidenceSet.id === "cross-system-profile-baseline-v1",
  );
  baseline.extendsEvidenceSetIds = ["managed-byoc-control-v1"];
  assert.match(
    validateDeploymentProfileSemantics(catalog).join("\n"),
    /DEPLOY-DESIGNED-005/u,
  );
});

test("rejects a Platform authority artifact for Standalone qualification", async () => {
  const result = await validateDeploymentProfiles(repositoryRoot);
  const catalog = structuredClone(result.catalog);
  const local = findProfile(catalog, "local-standalone-desktop");
  local.currentStatus = "QUALIFIED";
  local.implementation = {
    adapterPackages: ["packages/integrations/local-host"],
    compositionRoot: "apps/local-host",
    evidence: ["reports/implementation/local-host.yaml"],
  };
  local.activeQualificationRef = {
    contentDigest: `sha256:${"a".repeat(64)}`,
    recordId: "qualification-local-authority-mismatch",
  };
  const records = new Map([
    [
      "qualification-local-authority-mismatch",
      {
        contentDigest: `sha256:${"a".repeat(64)}`,
        record: {
          profileId: "local-standalone-desktop",
          reassessBy: "2099-01-01T00:00:00Z",
          releaseSet: { productAuthority: { kind: "PLATFORM" } },
        },
      },
    ],
  ]);
  assert.match(
    validateDeploymentProfileSemantics(
      catalog,
      records,
      new Date("2026-08-01T00:00:00Z"),
    ).join("\n"),
    /DEPLOY-QUALIFIED-007/u,
  );
});

test("rejects deployment profile branching in application code", () => {
  const errors = validateCoreSource(
    "packages/contexts/runs/src/features/start/application/use-case.ts",
    "if (isBYOC) { return 'managed-byoc'; }",
  ).join("\n");
  assert.match(errors, /DEPLOY-CORE-001/u);
  assert.match(errors, /DEPLOY-CORE-002/u);
});

test("rejects profile branching through member expressions and aliases", async () => {
  const result = await validateDeploymentProfiles(repositoryRoot);
  const vocabulary = buildForbiddenProfileVocabulary(result.catalog);
  const errors = validateCoreSource(
    "packages/contexts/runs/src/features/start/application/use-case.ts",
    "if (deploymentMode === Profile.ManagedByoc) return true;",
    {
      forbiddenIdentifiers: vocabulary.identifiers,
      forbiddenLiterals: vocabulary.literals,
    },
  ).join("\n");
  assert.match(errors, /DEPLOY-CORE-001/u);
});

test("rejects ambiguous bare provisioning vocabulary in core", () => {
  const errors = validateCoreSource(
    "packages/contexts/scope/src/features/create/application/use-case.ts",
    "export const ProvisioningStatus = 'provisioning';",
  ).join("\n");
  assert.match(errors, /DEPLOY-CORE-004/u);
  assert.match(errors, /DEPLOY-CORE-005/u);
});

test("requires qualification evidence to verify each gate claim", async () => {
  const result = await validateDeploymentProfiles(repositoryRoot);
  const errors = validateQualificationRecordSemantics(
    {
      assessedAt: "2026-08-01T00:00:00Z",
      assessments: [
        {
          evidence: [],
          gateId: "fencing",
          outcome: "PASS",
          verifiedClaims: [],
        },
      ],
      reassessBy: "2026-09-01T00:00:00Z",
      recordId: "qualification-missing-claim",
      releaseSet: { contracts: [] },
    },
    result.catalog.qualificationGateCatalog,
  ).join("\n");
  assert.match(errors, /DEPLOY-RECORD-CLAIM-001/u);
});

test("rejects inward adapter imports from domain code", () => {
  const errors = validateCoreSource(
    "packages/contexts/runs/src/features/start/domain/run.ts",
    "import { database } from '../adapters/outbound/database.js';",
  ).join("\n");
  assert.match(errors, /DEPLOY-CORE-003/u);
});

test("rejects cloud provider imports from application code", () => {
  const errors = validateCoreSource(
    "packages/contexts/placement/src/features/select/application/use-case.ts",
    "import { EC2Client } from '@aws-sdk/client-ec2';",
  ).join("\n");
  assert.match(errors, /DEPLOY-CORE-003/u);
});

test("allows narrow typed capabilities in application code", () => {
  const errors = validateCoreSource(
    "packages/contexts/runs/src/features/start/application/use-case.ts",
    "export function startRun(capability) { return capability.admit(); }",
  );
  assert.deepEqual(errors, []);
});

test("allows profile vocabulary only for a registered owning context", () => {
  const source = "export const profile = isBYOC ? 'managed-byoc' : 'managed-shared-saas';";
  assert.notDeepEqual(
    validateCoreSource(
      "packages/contexts/placement/src/features/plan/application/use-case.ts",
      source,
    ),
    [],
  );
  assert.deepEqual(
    validateCoreSource(
      "packages/contexts/placement/src/features/plan/application/use-case.ts",
      source,
      { allowProfileVocabulary: true },
    ),
    [],
  );
});

test("still rejects provider imports for a profile vocabulary owner", () => {
  const errors = validateCoreSource(
    "packages/contexts/placement/src/features/plan/application/use-case.ts",
    "import { EC2Client } from '@aws-sdk/client-ec2';",
    { allowProfileVocabulary: true },
  );
  assert.match(errors.join("\n"), /DEPLOY-CORE-003/u);
});

test("allows only additions in qualification record history", () => {
  assert.deepEqual(
    validateQualificationHistoryEntries([
      "A\tarchitecture/deployment-profiles/qualification-records/qualification-v1.yaml",
    ]),
    [],
  );
  const errors = validateQualificationHistoryEntries([
    "M\tarchitecture/deployment-profiles/qualification-records/qualification-v1.yaml",
    "D\tarchitecture/deployment-profiles/qualification-records/qualification-v0.yaml",
  ]).join("\n");
  assert.match(errors, /Git status M/u);
  assert.match(errors, /Git status D/u);
});
