import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import YAML from "yaml";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = path.resolve(scriptDirectory, "../..");

const requiredAuthorityDimensions = new Set([
  "PlatformDesiredRevision",
  "InstallationEnrollmentIncarnation",
  "InstallationAuthorityEpoch",
  "InstallationWriterLease",
  "RuntimeBindingGeneration",
  "ARDeploymentAuthorityGeneration",
  "RunAuthorityGeneration",
  "ExecutionAuthorityLease",
]);
const requiredProjectionStatuses = new Set([
  "SETTING_UP",
  "OPERATIONAL",
  "DEGRADED",
  "ACTION_REQUIRED",
  "DRAINING",
  "SUSPENDED",
  "QUARANTINED",
  "RETIRED",
]);
const requiredConditions = new Set([
  "Connectivity",
  "ConfigurationSync",
  "InstallationMutationAuthority",
  "KmsAvailability",
  "OrchestratorComponentHealth",
  "ARControlPlaneComponentHealth",
  "ProviderToolchainCompatibility",
  "UpgradeStatus",
  "DataDisposition",
]);
const requiredInstallationLifecycleTerms = new Set([
  "InstallationPlan",
  "InstallationOperation",
  "InstallationReconciliation",
  "InstallationUpgrade",
  "InstallationDisposition",
]);
const requiredExecutionLifecycleTerms = new Set([
  "RunAdmission",
  "RuntimeAllocation",
  "ExecutionDispatch",
  "RuntimeOperation",
  "ExecutionRecovery",
]);
const requiredScopeLifecycleTerms = new Set([
  "ScopeAdmission",
  "ScopeBinding",
]);

function parseArguments(argv) {
  const rootIndex = argv.indexOf("--root");
  if (rootIndex !== -1 && !argv[rootIndex + 1]) {
    throw new Error("--root requires a path");
  }
  return {
    root:
      rootIndex === -1
        ? defaultRepositoryRoot
        : path.resolve(argv[rootIndex + 1]),
  };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readYaml(filePath) {
  return YAML.parse(await readFile(filePath, "utf8"));
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function addMissingSetMembers(actualValues, requiredValues, code, label, errors) {
  const actual = new Set(actualValues ?? []);
  for (const required of requiredValues) {
    if (!actual.has(required)) {
      errors.push(`${code} missing required ${label} ${required}`);
    }
  }
}

function addUnexpectedSetMembers(actualValues, requiredValues, code, label, errors) {
  for (const actual of new Set(actualValues ?? [])) {
    if (!requiredValues.has(actual)) {
      errors.push(`${code} unexpected ${label} ${actual}`);
    }
  }
}

function validateExactSet(actualValues, requiredValues, code, label, errors) {
  addMissingSetMembers(actualValues, requiredValues, code, label, errors);
  addUnexpectedSetMembers(actualValues, requiredValues, code, label, errors);
}

export function validateManagedInstallationSemantics(policy, deploymentCatalog) {
  const errors = [];
  const profile = deploymentCatalog.profiles?.find(
    (candidate) => candidate.id === policy.profileId,
  );
  if (!profile) {
    errors.push(
      `INSTALL-PROFILE-001 ${policy.profileId}: deployment profile does not exist`,
    );
  } else {
    if (profile.category !== "MANAGED_BYOC") {
      errors.push(
        `INSTALL-PROFILE-002 ${policy.profileId}: policy requires MANAGED_BYOC category`,
      );
    }
    if (
      profile.currentStatus !== policy.architectureStatus ||
      profile.currentStatus !== "DESIGNED"
    ) {
      errors.push(
        `INSTALL-PROFILE-003 ${policy.profileId}: policy and profile must remain DESIGNED until implementation evidence exists`,
      );
    }
    if (
      profile.v1Scope !== "DESIGN_ONLY" ||
      profile.v1TargetStatus !== "DESIGNED"
    ) {
      errors.push(
        `INSTALL-PROFILE-004 ${policy.profileId}: Managed BYOC must remain design-only in v1`,
      );
    }
    if (
      profile.orchestratorPlacement !== "CUSTOMER_CLOUD" ||
      profile.runtimePlacement !== "CUSTOMER_CLOUD"
    ) {
      errors.push(
        `INSTALL-PROFILE-005 ${policy.profileId}: Orchestrator and AR must remain customer-cloud placed`,
      );
    }
  }

  addMissingSetMembers(
    policy.distinctAuthorityDimensions,
    requiredAuthorityDimensions,
    "INSTALL-DIMENSION-001",
    "authority dimension",
    errors,
  );
  addMissingSetMembers(
    policy.customerProjectionStatuses,
    requiredProjectionStatuses,
    "INSTALL-STATUS-001",
    "projection status",
    errors,
  );
  addMissingSetMembers(
    policy.requiredConditions,
    requiredConditions,
    "INSTALL-CONDITION-001",
    "condition",
    errors,
  );
  validateExactSet(
    policy.terminology?.installationLifecycle,
    requiredInstallationLifecycleTerms,
    "INSTALL-TERM-001",
    "installation lifecycle term",
    errors,
  );
  validateExactSet(
    policy.terminology?.executionLifecycle,
    requiredExecutionLifecycleTerms,
    "INSTALL-TERM-002",
    "execution lifecycle term",
    errors,
  );
  validateExactSet(
    policy.terminology?.scopeLifecycle,
    requiredScopeLifecycleTerms,
    "INSTALL-TERM-003",
    "scope lifecycle term",
    errors,
  );
  const allTerms = [
    ...(policy.terminology?.installationLifecycle ?? []),
    ...(policy.terminology?.executionLifecycle ?? []),
    ...(policy.terminology?.scopeLifecycle ?? []),
  ];
  if (new Set(allTerms).size !== allTerms.length) {
    errors.push(
      "INSTALL-TERM-004 lifecycle vocabularies must be pairwise disjoint",
    );
  }

  return errors;
}

async function validateEvidencePaths(repositoryRoot, policy) {
  const errors = [];
  for (const evidenceRef of policy.evidenceRefs ?? []) {
    if (!(await pathExists(path.join(repositoryRoot, evidenceRef)))) {
      errors.push(`INSTALL-EVIDENCE-001 missing design evidence ${evidenceRef}`);
    }
  }
  return errors;
}

export async function validateManagedInstallationPolicy(repositoryRoot) {
  const policyDirectory = path.join(
    repositoryRoot,
    "architecture/managed-installation",
  );
  const schema = await readJson(
    path.join(policyDirectory, "managed-installation-policy.schema.json"),
  );
  const policy = await readYaml(
    path.join(policyDirectory, "managed-installation-policy.yaml"),
  );
  const deploymentCatalog = await readYaml(
    path.join(
      repositoryRoot,
      "architecture/deployment-profiles/deployment-profiles.yaml",
    ),
  );
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  const errors = [];
  if (!validate(policy)) {
    for (const error of validate.errors ?? []) {
      errors.push(
        `INSTALL-SCHEMA-001 ${error.instancePath || "/"} ${error.message ?? "is invalid"}`,
      );
    }
  }
  errors.push(
    ...validateManagedInstallationSemantics(policy, deploymentCatalog),
    ...(await validateEvidencePaths(repositoryRoot, policy)),
  );
  return { errors: errors.toSorted(), policy };
}

async function main() {
  const { root } = parseArguments(process.argv.slice(2));
  const result = await validateManagedInstallationPolicy(root);
  if (result.errors.length > 0) {
    for (const error of result.errors) {
      console.error(error);
    }
    process.exitCode = 1;
    return;
  }
  console.log(
    `Managed installation policy valid: ${result.policy.profileId} ${result.policy.architectureStatus}.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
