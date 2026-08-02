import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Lang, parse } from "@ast-grep/napi";
import Ajv2020 from "ajv/dist/2020.js";
import YAML from "yaml";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = path.resolve(scriptDirectory, "../..");
const sourceExtensions = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);
const forbiddenCoreIdentifiers = new Set([
  "DeploymentProfile",
  "DeploymentMode",
  "deploymentProfile",
  "deploymentMode",
  "isBYOC",
  "isByoc",
  "isDedicated",
  "isDesktop",
  "isManagedShared",
  "isStandalone",
]);
const forbiddenBareLifecycleIdentifiers = new Set([
  "Provisioning",
  "provisioning",
  "ProvisioningProcess",
  "provisioningProcess",
  "ProvisioningStatus",
  "provisioningStatus",
]);
const forbiddenCoreLiterals = new Set([
  "BYOC",
  "DEDICATED",
  "DESKTOP",
  "HYBRID_CONNECTED_RUNTIME",
  "MANAGED_SHARED_SAAS",
  "STANDALONE_SERVER",
  "hybrid-connected-runtime",
  "local-standalone-desktop",
  "managed-byoc",
  "managed-dedicated",
  "managed-shared-saas",
  "standalone-server",
]);
const forbiddenCoreReferencePatterns = [
  /(?:^|\/)(?:adapters|cloud|composition|deployment-profiles|profiles|providers)(?:\/|$)/u,
  /^@aws-sdk\//u,
  /^@azure\//u,
  /^@google-cloud\//u,
];
const requiredV1QualifiedProfiles = new Set([
  "local-standalone-desktop",
  "managed-shared-saas",
  "standalone-server",
]);
const requiredQualificationGates = new Map([
  [
    "contract-conformance",
    [
      "INSTALLATION_EXECUTION_LIFECYCLE_SEPARATION",
      "INSTALLATION_COMMAND_SEMANTIC_SEPARATION",
      "RUN_LIFECYCLE_COMMAND_SEMANTIC_SEPARATION",
      "AR_RECOVERY_DIAGNOSTIC_CORRELATION",
    ],
  ],
  ["identity", []],
  ["isolation", []],
  [
    "persistence",
    ["INSTALLATION_OPERATION_DURABILITY", "RUN_OPERATION_DURABILITY"],
  ],
  ["security", ["REDACTED_DIAGNOSTICS_EXPORT"]],
  ["restore-and-disaster-recovery", []],
  ["fencing", ["DISTINCT_AUTHORITY_TYPES"]],
  ["offline-behavior", ["NO_SILENT_FALLBACK"]],
  [
    "upgrades",
    ["INSTALLATION_CONDITION_BASED_READINESS", "RUN_PARTICIPANT_READINESS"],
  ],
  [
    "project-lifecycle-and-disposition",
    [
      "USER_SOURCE_UNLINK_ONLY",
      "MANAGED_WORKTREE_RETAIN_DEFAULT",
      "NO_AUTOMATIC_GIT_MUTATION",
    ],
  ],
]);
const acceptedProfileDefinitions = new Map([
  [
    "local-standalone-desktop",
    {
      authorityMode: "STANDALONE_AUTHORITY",
      category: "LOCAL_STANDALONE",
      designEvidenceSetId: "cross-system-profile-baseline-v1",
      orchestratorPlacement: "USER_DEVICE",
      runtimePlacement: "USER_DEVICE",
      v1Scope: "QUALIFY",
      v1TargetStatus: "QUALIFIED",
    },
  ],
  [
    "standalone-server",
    {
      authorityMode: "STANDALONE_AUTHORITY",
      category: "STANDALONE_SERVER",
      designEvidenceSetId: "cross-system-profile-baseline-v1",
      orchestratorPlacement: "CUSTOMER_INFRASTRUCTURE",
      runtimePlacement: "CUSTOMER_INFRASTRUCTURE",
      v1Scope: "QUALIFY",
      v1TargetStatus: "QUALIFIED",
    },
  ],
  [
    "managed-shared-saas",
    {
      authorityMode: "PLATFORM_AUTHORITY",
      category: "MANAGED_SHARED",
      designEvidenceSetId: "cross-system-profile-baseline-v1",
      orchestratorPlacement: "PLATFORM_SHARED",
      runtimePlacement: "PLATFORM_SHARED",
      v1Scope: "QUALIFY",
      v1TargetStatus: "QUALIFIED",
    },
  ],
  [
    "managed-dedicated",
    {
      authorityMode: "PLATFORM_AUTHORITY",
      category: "MANAGED_DEDICATED",
      currentStatus: "DESIGNED",
      designEvidenceSetId: "cross-system-profile-baseline-v1",
      orchestratorPlacement: "PLATFORM_DEDICATED",
      runtimePlacement: "PLATFORM_DEDICATED",
      v1Scope: "DESIGN_ONLY",
      v1TargetStatus: "DESIGNED",
    },
  ],
  [
    "managed-byoc",
    {
      authorityMode: "PLATFORM_AUTHORITY",
      category: "MANAGED_BYOC",
      currentStatus: "DESIGNED",
      designEvidenceSetId: "managed-byoc-control-v1",
      orchestratorPlacement: "CUSTOMER_CLOUD",
      runtimePlacement: "CUSTOMER_CLOUD",
      v1Scope: "DESIGN_ONLY",
      v1TargetStatus: "DESIGNED",
    },
  ],
  [
    "hybrid-connected-runtime",
    {
      authorityMode: "PLATFORM_AUTHORITY",
      category: "HYBRID_CONNECTED_RUNTIME",
      currentStatus: "DESIGNED",
      designEvidenceSetId: "cross-system-profile-baseline-v1",
      orchestratorPlacement: "PLATFORM_SHARED",
      runtimePlacement: "CUSTOMER_INFRASTRUCTURE",
      v1Scope: "DESIGN_ONLY",
      v1TargetStatus: "DESIGNED",
    },
  ],
]);

function setsEqual(leftValues, rightValues) {
  const left = new Set(leftValues ?? []);
  const right = new Set(rightValues ?? []);
  return (
    left.size === right.size && [...left].every((value) => right.has(value))
  );
}

function profileVocabularyVariants(value) {
  const words = value
    .replaceAll(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .split(/[^A-Za-z0-9]+/u)
    .filter(Boolean);
  if (words.length === 0) {
    return [];
  }
  const pascal = words
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join("");
  return [
    value,
    pascal,
    pascal[0].toLowerCase() + pascal.slice(1),
    words.map((word) => word.toUpperCase()).join("_"),
  ];
}

export function buildForbiddenProfileVocabulary(catalog) {
  const identifiers = new Set(forbiddenCoreIdentifiers);
  const literals = new Set(forbiddenCoreLiterals);
  for (const profile of catalog.profiles ?? []) {
    for (const source of [profile.id, profile.name, profile.category]) {
      for (const variant of profileVocabularyVariants(source)) {
        identifiers.add(variant);
        literals.add(variant);
      }
    }
  }
  return { identifiers, literals };
}

function parseArguments(argv) {
  const rootIndex = argv.indexOf("--root");
  const asOfIndex = argv.indexOf("--as-of");
  if (rootIndex !== -1 && !argv[rootIndex + 1]) {
    throw new Error("--root requires a path");
  }
  if (asOfIndex !== -1 && !argv[asOfIndex + 1]) {
    throw new Error("--as-of requires an ISO timestamp");
  }
  const asOf = asOfIndex === -1 ? null : new Date(argv[asOfIndex + 1]);
  if (asOf && Number.isNaN(asOf.getTime())) {
    throw new Error("--as-of requires a valid ISO timestamp");
  }
  return {
    asOf,
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

function schemaErrors(validate) {
  return (validate.errors ?? []).map(
    (error) =>
      `DEPLOY-SCHEMA-001 ${error.instancePath || "/"} ${error.message ?? "is invalid"}`,
  );
}

function qualificationSchemaErrors(filePath, validate) {
  return (validate.errors ?? []).map(
    (error) =>
      `DEPLOY-RECORD-SCHEMA-001 ${filePath}${error.instancePath || "/"} ${error.message ?? "is invalid"}`,
  );
}

function addUniqueIds(items, kind, errors) {
  const ids = new Set();
  for (const item of items ?? []) {
    if (ids.has(item.id)) {
      errors.push(`DEPLOY-ID-001 ${item.id}: duplicate ${kind} id`);
    }
    ids.add(item.id);
  }
  return ids;
}

export function validateDeploymentProfileSemantics(
  catalog,
  qualificationRecords = new Map(),
  asOf = null,
) {
  const errors = [];
  addUniqueIds(
    catalog.qualificationGateCatalog,
    "qualification gate",
    errors,
  );
  const profileIds = addUniqueIds(catalog.profiles, "profile", errors);
  const designEvidenceSetIds = addUniqueIds(
    catalog.designEvidenceSets,
    "design evidence set",
    errors,
  );
  const actualV1QualifiedProfiles = new Set();
  const gateById = new Map(
    (catalog.qualificationGateCatalog ?? []).map((gate) => [gate.id, gate]),
  );

  for (const [gateId, requiredClaims] of requiredQualificationGates) {
    const gate = gateById.get(gateId);
    if (!gate) {
      errors.push(`DEPLOY-GATE-001 ${gateId}: accepted qualification gate is missing`);
      continue;
    }
    if (!gate.requiredForQualification || gate.allowNotApplicable) {
      errors.push(
        `DEPLOY-GATE-002 ${gateId}: accepted gate must be required and must not allow NOT_APPLICABLE`,
      );
    }
    if (!setsEqual(gate.requiredClaims, requiredClaims)) {
      errors.push(
        `DEPLOY-GATE-003 ${gateId}: required claims differ from the accepted catalog`,
      );
    }
  }
  for (const gateId of gateById.keys()) {
    if (!requiredQualificationGates.has(gateId)) {
      errors.push(
        `DEPLOY-GATE-005 ${gateId}: adding a qualification gate requires a superseding ADR`,
      );
    }
  }

  for (const gate of catalog.qualificationGateCatalog ?? []) {
    if (gate.requiredForQualification && gate.allowNotApplicable) {
      errors.push(
        `DEPLOY-GATE-004 ${gate.id}: current required qualification gates cannot allow NOT_APPLICABLE`,
      );
    }
  }

  for (const evidenceSet of catalog.designEvidenceSets ?? []) {
    for (const parentId of evidenceSet.extendsEvidenceSetIds ?? []) {
      if (!designEvidenceSetIds.has(parentId)) {
        errors.push(
          `DEPLOY-DESIGNED-003 ${evidenceSet.id}: unknown parent evidence set ${parentId}`,
        );
      }
      if (parentId === evidenceSet.id) {
        errors.push(
          `DEPLOY-DESIGNED-004 ${evidenceSet.id}: evidence set cannot extend itself`,
        );
      }
    }
  }
  const evidenceSetById = new Map(
    (catalog.designEvidenceSets ?? []).map((evidenceSet) => [
      evidenceSet.id,
      evidenceSet,
    ]),
  );
  for (const evidenceSet of catalog.designEvidenceSets ?? []) {
    const pathIds = new Set();
    function containsCycle(evidenceSetId) {
      if (pathIds.has(evidenceSetId)) {
        return evidenceSetId;
      }
      pathIds.add(evidenceSetId);
      for (const parentId of
        evidenceSetById.get(evidenceSetId)?.extendsEvidenceSetIds ?? []) {
        const cycleId = containsCycle(parentId);
        if (cycleId) {
          return cycleId;
        }
      }
      pathIds.delete(evidenceSetId);
      return null;
    }
    const cycleId = containsCycle(evidenceSet.id);
    if (cycleId) {
      errors.push(
        `DEPLOY-DESIGNED-005 ${evidenceSet.id}: evidence-set inheritance cycle includes ${cycleId}`,
      );
    }
  }

  for (const profile of catalog.profiles ?? []) {
    const acceptedDefinition = acceptedProfileDefinitions.get(profile.id);
    if (!acceptedDefinition) {
      errors.push(
        `DEPLOY-PROFILE-001 ${profile.id}: adding a deployment profile requires a superseding ADR`,
      );
    } else {
      for (const [field, expected] of Object.entries(acceptedDefinition)) {
        if (profile[field] !== expected) {
          errors.push(
            `DEPLOY-PROFILE-002 ${profile.id}: ${field} must remain ${expected} under the accepted catalog`,
          );
        }
      }
    }
    if (!designEvidenceSetIds.has(profile.designEvidenceSetId)) {
      errors.push(
        `DEPLOY-DESIGNED-001 ${profile.id}: unknown design evidence set ${profile.designEvidenceSetId}`,
      );
    }
    if (profile.v1Scope === "QUALIFY") {
      actualV1QualifiedProfiles.add(profile.id);
      if (profile.v1TargetStatus !== "QUALIFIED") {
        errors.push(
          `DEPLOY-V1-001 ${profile.id}: QUALIFY requires v1TargetStatus QUALIFIED`,
        );
      }
    }
    if (
      profile.v1Scope === "DESIGN_ONLY" &&
      profile.v1TargetStatus !== "DESIGNED"
    ) {
      errors.push(
        `DEPLOY-V1-002 ${profile.id}: DESIGN_ONLY requires v1TargetStatus DESIGNED`,
      );
    }

    const implementation = profile.implementation ?? {};
    if (
      ["IMPLEMENTED", "QUALIFIED"].includes(profile.currentStatus) &&
      (!implementation.compositionRoot ||
        implementation.adapterPackages?.length === 0 ||
        implementation.evidence?.length === 0)
    ) {
      errors.push(
        `DEPLOY-IMPLEMENTED-001 ${profile.id}: ${profile.currentStatus} requires a composition root, adapter packages, and implementation evidence`,
      );
    }

    if (profile.currentStatus === "QUALIFIED") {
      const activeRef = profile.activeQualificationRef;
      if (!activeRef) {
        errors.push(
          `DEPLOY-QUALIFIED-001 ${profile.id}: QUALIFIED requires activeQualificationRef`,
        );
      } else {
        const stored = qualificationRecords.get(activeRef.recordId);
        if (!stored) {
          errors.push(
            `DEPLOY-QUALIFIED-002 ${profile.id}: active qualification record ${activeRef.recordId} does not exist`,
          );
        } else {
          if (stored.contentDigest !== activeRef.contentDigest) {
            errors.push(
              `DEPLOY-QUALIFIED-003 ${profile.id}: active qualification content digest does not match ${activeRef.recordId}`,
            );
          }
          if (stored.record.profileId !== profile.id) {
            errors.push(
              `DEPLOY-QUALIFIED-004 ${profile.id}: active qualification belongs to ${stored.record.profileId}`,
            );
          }
          const expectedAuthorityKind =
            profile.authorityMode === "PLATFORM_AUTHORITY"
              ? "PLATFORM"
              : "STANDALONE_AUTHORITY";
          if (
            stored.record.releaseSet?.productAuthority?.kind !==
            expectedAuthorityKind
          ) {
            errors.push(
              `DEPLOY-QUALIFIED-007 ${profile.id}: qualification authority artifact must be ${expectedAuthorityKind}`,
            );
          }
          if (
            asOf &&
            Date.parse(stored.record.reassessBy) <= asOf.getTime()
          ) {
            errors.push(
              `DEPLOY-QUALIFIED-005 ${profile.id}: active qualification ${activeRef.recordId} requires reassessment`,
            );
          }
        }
      }
    } else if (profile.activeQualificationRef !== null) {
      errors.push(
        `DEPLOY-QUALIFIED-006 ${profile.id}: only QUALIFIED profiles may have an activeQualificationRef`,
      );
    }
  }

  for (const profileId of acceptedProfileDefinitions.keys()) {
    if (!profileIds.has(profileId)) {
      errors.push(
        `DEPLOY-PROFILE-003 ${profileId}: accepted deployment profile is missing`,
      );
    }
  }

  for (const profileId of requiredV1QualifiedProfiles) {
    if (!actualV1QualifiedProfiles.has(profileId)) {
      errors.push(
        `DEPLOY-V1-003 ${profileId}: accepted v1 qualification target is missing`,
      );
    }
  }
  for (const profileId of actualV1QualifiedProfiles) {
    if (!requiredV1QualifiedProfiles.has(profileId)) {
      errors.push(
        `DEPLOY-V1-004 ${profileId}: adding a v1 qualification target requires a superseding ADR`,
      );
    }
  }
  if (profileIds.size === 0) {
    errors.push("DEPLOY-ID-002 deployment profile catalog is empty");
  }

  return errors;
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

async function validateEvidencePaths(repositoryRoot, catalog) {
  const errors = [];
  for (const evidenceSet of catalog.designEvidenceSets ?? []) {
    for (const evidenceRef of evidenceSet.evidenceRefs ?? []) {
      if (!(await pathExists(path.join(repositoryRoot, evidenceRef)))) {
        errors.push(
          `DEPLOY-DESIGNED-002 ${evidenceSet.id}: missing design evidence ${evidenceRef}`,
        );
      }
    }
  }

  for (const profile of catalog.profiles ?? []) {
    if (!["IMPLEMENTED", "QUALIFIED"].includes(profile.currentStatus)) {
      continue;
    }
    const packagePaths = [
      profile.implementation.compositionRoot,
      ...(profile.implementation.adapterPackages ?? []),
    ];
    for (const packagePath of packagePaths) {
      if (
        !(await pathExists(path.join(repositoryRoot, packagePath, "package.json")))
      ) {
        errors.push(
          `DEPLOY-IMPLEMENTED-002 ${profile.id}: ${packagePath} must be a materialized package`,
        );
      }
    }
    for (const evidenceRef of profile.implementation.evidence ?? []) {
      if (!(await pathExists(path.join(repositoryRoot, evidenceRef)))) {
        errors.push(
          `DEPLOY-IMPLEMENTED-003 ${profile.id}: missing implementation evidence ${evidenceRef}`,
        );
      }
    }
  }
  return errors;
}

export function validateQualificationRecordSemantics(
  record,
  gateCatalog,
) {
  const errors = [];
  const gateById = new Map(
    (gateCatalog ?? []).map((gate) => [gate.id, gate]),
  );
  const assessmentIds = new Set();

  for (const assessment of record.assessments ?? []) {
    if (assessmentIds.has(assessment.gateId)) {
      errors.push(
        `DEPLOY-RECORD-GATE-001 ${record.recordId}: duplicate assessment for ${assessment.gateId}`,
      );
    }
    assessmentIds.add(assessment.gateId);
    const gate = gateById.get(assessment.gateId);
    if (!gate) {
      errors.push(
        `DEPLOY-RECORD-GATE-002 ${record.recordId}: unknown gate ${assessment.gateId}`,
      );
      continue;
    }
    if (
      assessment.outcome === "NOT_APPLICABLE" &&
      !gate.allowNotApplicable
    ) {
      errors.push(
        `DEPLOY-RECORD-GATE-003 ${record.recordId}/${assessment.gateId}: gate does not allow NOT_APPLICABLE`,
      );
    }
    if (
      assessment.outcome === "NOT_APPLICABLE" &&
      !assessment.rationale
    ) {
      errors.push(
        `DEPLOY-RECORD-GATE-004 ${record.recordId}/${assessment.gateId}: NOT_APPLICABLE requires rationale`,
      );
    }
    if (gate && !setsEqual(assessment.verifiedClaims, gate.requiredClaims)) {
      errors.push(
        `DEPLOY-RECORD-CLAIM-001 ${record.recordId}/${assessment.gateId}: verified claims differ from the gate contract`,
      );
    }
  }

  for (const gate of gateCatalog ?? []) {
    if (!gate.requiredForQualification) {
      continue;
    }
    const assessment = (record.assessments ?? []).find(
      (item) => item.gateId === gate.id,
    );
    const allowedOutcomes = gate.allowNotApplicable
      ? ["PASS", "NOT_APPLICABLE"]
      : ["PASS"];
    if (!assessment || !allowedOutcomes.includes(assessment.outcome)) {
      errors.push(
        `DEPLOY-RECORD-GATE-005 ${record.recordId}: required gate ${gate.id} has not passed`,
      );
    }
  }

  if (Date.parse(record.reassessBy) <= Date.parse(record.assessedAt)) {
    errors.push(
      `DEPLOY-RECORD-TIME-001 ${record.recordId}: reassessBy must follow assessedAt`,
    );
  }

  const contractIds = new Set();
  for (const contract of record.releaseSet?.contracts ?? []) {
    if (contractIds.has(contract.id)) {
      errors.push(
        `DEPLOY-RECORD-CONTRACT-001 ${record.recordId}: duplicate contract ${contract.id}`,
      );
    }
    contractIds.add(contract.id);
  }

  return errors;
}

export function validateCoreSource(
  filePath,
  source,
  {
    allowProfileVocabulary = false,
    forbiddenIdentifiers = forbiddenCoreIdentifiers,
    forbiddenLiterals = forbiddenCoreLiterals,
  } = {},
) {
  const errors = [];
  const language = [".jsx", ".tsx"].includes(path.extname(filePath))
    ? Lang.Tsx
    : [".cjs", ".js", ".jsx", ".mjs"].includes(path.extname(filePath))
      ? Lang.JavaScript
      : Lang.TypeScript;
  const root = parse(language, source).root();

  function visit(node) {
    if (
      !allowProfileVocabulary &&
      node.kind() === "identifier" &&
      forbiddenIdentifiers.has(node.text())
    ) {
      errors.push(
        `DEPLOY-CORE-001 ${filePath}:${node.range().start.line + 1} profile identifier ${node.text()} is forbidden in domain/application`,
      );
    }
    if (
      !allowProfileVocabulary &&
      node.kind() === "string_fragment" &&
      forbiddenLiterals.has(node.text())
    ) {
      errors.push(
        `DEPLOY-CORE-002 ${filePath}:${node.range().start.line + 1} profile literal ${node.text()} is forbidden in domain/application`,
      );
    }
    if (
      node.kind() === "identifier" &&
      forbiddenBareLifecycleIdentifiers.has(node.text())
    ) {
      errors.push(
        `DEPLOY-CORE-004 ${filePath}:${node.range().start.line + 1} ambiguous bare lifecycle identifier ${node.text()} is forbidden`,
      );
    }
    if (
      node.kind() === "string_fragment" &&
      node.text().toLowerCase() === "provisioning"
    ) {
      errors.push(
        `DEPLOY-CORE-005 ${filePath}:${node.range().start.line + 1} ambiguous bare lifecycle literal ${node.text()} is forbidden`,
      );
    }
    if (
      node.kind() === "string_fragment" &&
      forbiddenCoreReferencePatterns.some((pattern) =>
        pattern.test(node.text()),
      )
    ) {
      errors.push(
        `DEPLOY-CORE-003 ${filePath}:${node.range().start.line + 1} adapter/composition/cloud/provider reference ${node.text()} is forbidden`,
      );
    }
    for (const child of node.children()) {
      visit(child);
    }
  }

  visit(root);
  return errors;
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    (error) => {
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    },
  );
  const paths = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await walk(entryPath)));
    } else {
      paths.push(entryPath);
    }
  }
  return paths;
}

async function validateCoreProfileIndependence(repositoryRoot, catalog) {
  const errors = [];
  const vocabularyOwnerPaths = catalog.invariants?.profileVocabularyOwnerPaths ?? [];
  const forbiddenVocabulary = buildForbiddenProfileVocabulary(catalog);
  for (const rootName of ["apps", "packages"]) {
    for (const filePath of await walk(path.join(repositoryRoot, rootName))) {
      const relativePath = path.relative(repositoryRoot, filePath).split(path.sep).join("/");
      const segments = relativePath.split("/");
      if (
        !sourceExtensions.has(path.extname(filePath)) ||
        (!segments.includes("domain") && !segments.includes("application"))
      ) {
        continue;
      }
      const allowProfileVocabulary = vocabularyOwnerPaths.some(
        (ownerPath) =>
          relativePath === ownerPath || relativePath.startsWith(`${ownerPath}/`),
      );
      errors.push(
        ...validateCoreSource(relativePath, await readFile(filePath, "utf8"), {
          allowProfileVocabulary,
          forbiddenIdentifiers: forbiddenVocabulary.identifiers,
          forbiddenLiterals: forbiddenVocabulary.literals,
        }),
      );
    }
  }
  return errors;
}

async function loadQualificationRecords(
  catalogDirectory,
  validateRecordSchema,
  gateCatalog,
) {
  const recordDirectory = path.join(catalogDirectory, "qualification-records");
  const records = new Map();
  const errors = [];
  const filePaths = (await walk(recordDirectory))
    .filter((filePath) => filePath.endsWith(".yaml"))
    .toSorted();

  for (const filePath of filePaths) {
    const relativePath = path
      .relative(catalogDirectory, filePath)
      .split(path.sep)
      .join("/");
    const source = await readFile(filePath, "utf8");
    let record;
    try {
      record = YAML.parse(source);
    } catch (error) {
      errors.push(
        `DEPLOY-RECORD-YAML-001 ${relativePath}: ${error.message}`,
      );
      continue;
    }

    if (!validateRecordSchema(record)) {
      errors.push(
        ...qualificationSchemaErrors(relativePath, validateRecordSchema),
      );
      continue;
    }

    const expectedFileName = `${record.recordId}.yaml`;
    if (path.basename(filePath) !== expectedFileName) {
      errors.push(
        `DEPLOY-RECORD-ID-001 ${relativePath}: filename must be ${expectedFileName}`,
      );
    }
    if (records.has(record.recordId)) {
      errors.push(
        `DEPLOY-RECORD-ID-002 ${record.recordId}: duplicate qualification record identity`,
      );
      continue;
    }

    const contentDigest = `sha256:${createHash("sha256").update(source).digest("hex")}`;
    records.set(record.recordId, {
      contentDigest,
      record,
      relativePath,
    });
    errors.push(
      ...validateQualificationRecordSemantics(record, gateCatalog),
    );
  }

  return { errors, records };
}

export async function validateDeploymentProfiles(repositoryRoot, asOf = null) {
  const catalogDirectory = path.join(
    repositoryRoot,
    "architecture/deployment-profiles",
  );
  const schema = await readJson(
    path.join(catalogDirectory, "deployment-profiles.schema.json"),
  );
  const qualificationRecordSchema = await readJson(
    path.join(catalogDirectory, "qualification-record.schema.json"),
  );
  const catalog = await readYaml(
    path.join(catalogDirectory, "deployment-profiles.yaml"),
  );
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  const validateRecordSchema = ajv.compile(qualificationRecordSchema);
  const errors = validate(catalog) ? [] : schemaErrors(validate);
  const qualificationRecords = await loadQualificationRecords(
    catalogDirectory,
    validateRecordSchema,
    catalog.qualificationGateCatalog,
  );
  errors.push(...qualificationRecords.errors);
  errors.push(
    ...validateDeploymentProfileSemantics(
      catalog,
      qualificationRecords.records,
      asOf,
    ),
  );
  errors.push(...(await validateEvidencePaths(repositoryRoot, catalog)));
  errors.push(
    ...(await validateCoreProfileIndependence(repositoryRoot, catalog)),
  );
  return {
    catalog,
    errors: errors.toSorted(),
    qualificationRecords: qualificationRecords.records,
  };
}

async function main() {
  const { asOf, root } = parseArguments(process.argv.slice(2));
  const result = await validateDeploymentProfiles(root, asOf ?? new Date());
  if (result.errors.length > 0) {
    for (const error of result.errors) {
      console.error(error);
    }
    process.exitCode = 1;
    return;
  }
  console.log(
    `Deployment profiles valid: ${result.catalog.profiles.length} profiles, ${result.catalog.qualificationGateCatalog.length} qualification gates.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
