import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  validateManagedInstallationPolicy,
  validateManagedInstallationSemantics,
} from "./validate-managed-installation-policy.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");

test("accepts the canonical managed installation policy", async () => {
  const result = await validateManagedInstallationPolicy(repositoryRoot);
  assert.deepEqual(result.errors, []);
  assert.equal(result.policy.profileId, "managed-byoc");
  assert.equal(result.policy.architectureStatus, "DESIGNED");
});

test("rejects promotion before the deployment profile is implemented", async () => {
  const result = await validateManagedInstallationPolicy(repositoryRoot);
  const policy = structuredClone(result.policy);
  policy.architectureStatus = "IMPLEMENTED";
  const catalog = {
    profiles: [
      {
        id: "managed-byoc",
        category: "MANAGED_BYOC",
        currentStatus: "IMPLEMENTED",
        v1Scope: "DESIGN_ONLY",
        v1TargetStatus: "DESIGNED",
        orchestratorPlacement: "CUSTOMER_CLOUD",
        runtimePlacement: "CUSTOMER_CLOUD",
      },
    ],
  };
  assert.match(
    validateManagedInstallationSemantics(policy, catalog).join("\n"),
    /INSTALL-PROFILE-003/u,
  );
});

test("rejects a missing authority dimension", async () => {
  const result = await validateManagedInstallationPolicy(repositoryRoot);
  const policy = structuredClone(result.policy);
  policy.distinctAuthorityDimensions = policy.distinctAuthorityDimensions.filter(
    (dimension) => dimension !== "ExecutionAuthorityLease",
  );
  const catalog = {
    profiles: [
      {
        id: "managed-byoc",
        category: "MANAGED_BYOC",
        currentStatus: "DESIGNED",
        v1Scope: "DESIGN_ONLY",
        v1TargetStatus: "DESIGNED",
        orchestratorPlacement: "CUSTOMER_CLOUD",
        runtimePlacement: "CUSTOMER_CLOUD",
      },
    ],
  };
  assert.match(
    validateManagedInstallationSemantics(policy, catalog).join("\n"),
    /INSTALL-DIMENSION-001 missing required authority dimension ExecutionAuthorityLease/u,
  );
});

test("rejects non-customer placement for Managed BYOC", async () => {
  const result = await validateManagedInstallationPolicy(repositoryRoot);
  const catalog = {
    profiles: [
      {
        id: "managed-byoc",
        category: "MANAGED_BYOC",
        currentStatus: "DESIGNED",
        v1Scope: "DESIGN_ONLY",
        v1TargetStatus: "DESIGNED",
        orchestratorPlacement: "PLATFORM_SHARED",
        runtimePlacement: "CUSTOMER_CLOUD",
      },
    ],
  };
  assert.match(
    validateManagedInstallationSemantics(result.policy, catalog).join("\n"),
    /INSTALL-PROFILE-005/u,
  );
});

test("rejects arbitrary or overlapping lifecycle vocabulary", async () => {
  const result = await validateManagedInstallationPolicy(repositoryRoot);
  const policy = structuredClone(result.policy);
  policy.terminology.installationLifecycle[0] = "InstallationAlpha";
  policy.terminology.executionLifecycle[0] = "InstallationAlpha";
  const catalog = {
    profiles: [
      {
        id: "managed-byoc",
        category: "MANAGED_BYOC",
        currentStatus: "DESIGNED",
        v1Scope: "DESIGN_ONLY",
        v1TargetStatus: "DESIGNED",
        orchestratorPlacement: "CUSTOMER_CLOUD",
        runtimePlacement: "CUSTOMER_CLOUD",
      },
    ],
  };
  const errors = validateManagedInstallationSemantics(policy, catalog).join("\n");
  assert.match(errors, /INSTALL-TERM-001/u);
  assert.match(errors, /INSTALL-TERM-002/u);
  assert.match(errors, /INSTALL-TERM-004/u);
});
