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
  ["persistence", ["INSTALLATION_OPERATION_DURABILITY", "RUN_OPERATION_DURABILITY"]],
  ["security", ["REDACTED_DIAGNOSTICS_EXPORT"]],
  ["restore-and-disaster-recovery", []],
  ["fencing", ["DISTINCT_AUTHORITY_TYPES"]],
  ["offline-behavior", ["NO_SILENT_FALLBACK"]],
  ["upgrades", ["INSTALLATION_CONDITION_BASED_READINESS", "RUN_PARTICIPANT_READINESS"]],
  [
    "project-lifecycle-and-disposition",
    ["USER_SOURCE_UNLINK_ONLY", "MANAGED_WORKTREE_RETAIN_DEFAULT", "NO_AUTOMATIC_GIT_MUTATION"],
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
  return left.size === right.size && [...left].every((value) => right.has(value));
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

function validateQualificationGates(catalog, errors) {
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
      errors.push(`DEPLOY-GATE-003 ${gateId}: required claims differ from the accepted catalog`);
    }
  }
  for (const gate of catalog.qualificationGateCatalog ?? []) {
    if (!requiredQualificationGates.has(gate.id)) {
      errors.push(`DEPLOY-GATE-005 ${gate.id}: adding a qualification gate requires a superseding ADR`);
    }
    if (gate.requiredForQualification && gate.allowNotApplicable) {
      errors.push(
        `DEPLOY-GATE-004 ${gate.id}: current required qualification gates cannot allow NOT_APPLICABLE`,
      );
    }
  }
}

function findEvidenceSetCycle(evidenceSetId, evidenceSetById, pathIds = new Set()) {
  if (pathIds.has(evidenceSetId)) {
    return evidenceSetId;
  }
  const nextPathIds = new Set(pathIds).add(evidenceSetId);
  for (const parentId of evidenceSetById.get(evidenceSetId)?.extendsEvidenceSetIds ?? []) {
    const cycleId = findEvidenceSetCycle(parentId, evidenceSetById, nextPathIds);
    if (cycleId) {
      return cycleId;
    }
  }
  return null;
}

function validateDesignEvidenceSets(catalog, designEvidenceSetIds, errors) {
  const evidenceSetById = new Map(
    (catalog.designEvidenceSets ?? []).map((evidenceSet) => [evidenceSet.id, evidenceSet]),
  );
  for (const evidenceSet of catalog.designEvidenceSets ?? []) {
    for (const parentId of evidenceSet.extendsEvidenceSetIds ?? []) {
      if (!designEvidenceSetIds.has(parentId)) {
        errors.push(`DEPLOY-DESIGNED-003 ${evidenceSet.id}: unknown parent evidence set ${parentId}`);
      }
      if (parentId === evidenceSet.id) {
        errors.push(`DEPLOY-DESIGNED-004 ${evidenceSet.id}: evidence set cannot extend itself`);
      }
    }
    const cycleId = findEvidenceSetCycle(evidenceSet.id, evidenceSetById);
    if (cycleId) {
      errors.push(
        `DEPLOY-DESIGNED-005 ${evidenceSet.id}: evidence-set inheritance cycle includes ${cycleId}`,
      );
    }
  }
}

function validateAcceptedProfileDefinition(profile, errors) {
  const acceptedDefinition = acceptedProfileDefinitions.get(profile.id);
  if (!acceptedDefinition) {
    errors.push(`DEPLOY-PROFILE-001 ${profile.id}: adding a deployment profile requires a superseding ADR`);
    return;
  }
  for (const [field, expected] of Object.entries(acceptedDefinition)) {
    if (profile[field] !== expected) {
      errors.push(
        `DEPLOY-PROFILE-002 ${profile.id}: ${field} must remain ${expected} under the accepted catalog`,
      );
    }
  }
}

function validateProfileImplementation(profile, errors) {
  if (!["IMPLEMENTED", "QUALIFIED"].includes(profile.currentStatus)) {
    return;
  }
  const implementation = profile.implementation ?? {};
  if (
    !implementation.compositionRoot ||
    implementation.adapterPackages?.length === 0 ||
    implementation.evidence?.length === 0
  ) {
    errors.push(
      `DEPLOY-IMPLEMENTED-001 ${profile.id}: ${profile.currentStatus} requires a composition root, adapter packages, and implementation evidence`,
    );
  }
}

function validateQualificationAuthority(profile, stored, errors) {
  const expectedAuthorityKind =
    profile.authorityMode === "PLATFORM_AUTHORITY" ? "PLATFORM" : "STANDALONE_AUTHORITY";
  if (stored.record.releaseSet?.productAuthority?.kind !== expectedAuthorityKind) {
    errors.push(
      `DEPLOY-QUALIFIED-007 ${profile.id}: qualification authority artifact must be ${expectedAuthorityKind}`,
    );
  }
}

function validateQualificationRecordReference(profile, activeRef, stored, asOf, errors) {
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
  validateQualificationAuthority(profile, stored, errors);
  if (asOf && Date.parse(stored.record.reassessBy) <= asOf.getTime()) {
    errors.push(
      `DEPLOY-QUALIFIED-005 ${profile.id}: active qualification ${activeRef.recordId} requires reassessment`,
    );
  }
}

function validateActiveQualification(profile, qualificationRecords, asOf, errors) {
  if (profile.currentStatus !== "QUALIFIED") {
    if (profile.activeQualificationRef !== null) {
      errors.push(
        `DEPLOY-QUALIFIED-006 ${profile.id}: only QUALIFIED profiles may have an activeQualificationRef`,
      );
    }
    return;
  }
  const activeRef = profile.activeQualificationRef;
  if (!activeRef) {
    errors.push(`DEPLOY-QUALIFIED-001 ${profile.id}: QUALIFIED requires activeQualificationRef`);
    return;
  }
  const stored = qualificationRecords.get(activeRef.recordId);
  if (!stored) {
    errors.push(
      `DEPLOY-QUALIFIED-002 ${profile.id}: active qualification record ${activeRef.recordId} does not exist`,
    );
    return;
  }
  validateQualificationRecordReference(profile, activeRef, stored, asOf, errors);
}

function validateProfile(profile, designEvidenceSetIds, qualificationRecords, asOf, errors) {
  validateAcceptedProfileDefinition(profile, errors);
  if (!designEvidenceSetIds.has(profile.designEvidenceSetId)) {
    errors.push(
      `DEPLOY-DESIGNED-001 ${profile.id}: unknown design evidence set ${profile.designEvidenceSetId}`,
    );
  }
  if (profile.v1Scope === "QUALIFY" && profile.v1TargetStatus !== "QUALIFIED") {
    errors.push(`DEPLOY-V1-001 ${profile.id}: QUALIFY requires v1TargetStatus QUALIFIED`);
  }
  if (profile.v1Scope === "DESIGN_ONLY" && profile.v1TargetStatus !== "DESIGNED") {
    errors.push(`DEPLOY-V1-002 ${profile.id}: DESIGN_ONLY requires v1TargetStatus DESIGNED`);
  }
  validateProfileImplementation(profile, errors);
  validateActiveQualification(profile, qualificationRecords, asOf, errors);
}

function validateProfileCatalogCoverage(profileIds, actualV1QualifiedProfiles, errors) {
  for (const profileId of acceptedProfileDefinitions.keys()) {
    if (!profileIds.has(profileId)) {
      errors.push(`DEPLOY-PROFILE-003 ${profileId}: accepted deployment profile is missing`);
    }
  }
  for (const profileId of requiredV1QualifiedProfiles) {
    if (!actualV1QualifiedProfiles.has(profileId)) {
      errors.push(`DEPLOY-V1-003 ${profileId}: accepted v1 qualification target is missing`);
    }
  }
  for (const profileId of actualV1QualifiedProfiles) {
    if (!requiredV1QualifiedProfiles.has(profileId)) {
      errors.push(`DEPLOY-V1-004 ${profileId}: adding a v1 qualification target requires a superseding ADR`);
    }
  }
  if (profileIds.size === 0) {
    errors.push("DEPLOY-ID-002 deployment profile catalog is empty");
  }
}

export function validateDeploymentProfileSemantics(
  catalog,
  qualificationRecords = new Map(),
  asOf = null,
) {
  const errors = [];
  addUniqueIds(catalog.qualificationGateCatalog, "qualification gate", errors);
  const profileIds = addUniqueIds(catalog.profiles, "profile", errors);
  const designEvidenceSetIds = addUniqueIds(catalog.designEvidenceSets, "design evidence set", errors);
  const actualV1QualifiedProfiles = new Set(
    (catalog.profiles ?? []).filter((profile) => profile.v1Scope === "QUALIFY").map((profile) => profile.id),
  );

  validateQualificationGates(catalog, errors);
  validateDesignEvidenceSets(catalog, designEvidenceSetIds, errors);
  for (const profile of catalog.profiles ?? []) {
    validateProfile(profile, designEvidenceSetIds, qualificationRecords, asOf, errors);
  }
  validateProfileCatalogCoverage(profileIds, actualV1QualifiedProfiles, errors);
  return errors;
}

function validateAssessment(record, assessment, gateById, errors) {
  const gate = gateById.get(assessment.gateId);
  if (!gate) {
    errors.push(`DEPLOY-RECORD-GATE-002 ${record.recordId}: unknown gate ${assessment.gateId}`);
    return;
  }
  if (assessment.outcome === "NOT_APPLICABLE" && !gate.allowNotApplicable) {
    errors.push(
      `DEPLOY-RECORD-GATE-003 ${record.recordId}/${assessment.gateId}: gate does not allow NOT_APPLICABLE`,
    );
  }
  if (assessment.outcome === "NOT_APPLICABLE" && !assessment.rationale) {
    errors.push(
      `DEPLOY-RECORD-GATE-004 ${record.recordId}/${assessment.gateId}: NOT_APPLICABLE requires rationale`,
    );
  }
  if (!setsEqual(assessment.verifiedClaims, gate.requiredClaims)) {
    errors.push(
      `DEPLOY-RECORD-CLAIM-001 ${record.recordId}/${assessment.gateId}: verified claims differ from the gate contract`,
    );
  }
}

function validateRequiredAssessments(record, gateCatalog, errors) {
  const assessmentByGateId = new Map(
    (record.assessments ?? []).map((assessment) => [assessment.gateId, assessment]),
  );
  for (const gate of gateCatalog ?? []) {
    if (!gate.requiredForQualification) {
      continue;
    }
    const allowedOutcomes = gate.allowNotApplicable ? ["PASS", "NOT_APPLICABLE"] : ["PASS"];
    if (!allowedOutcomes.includes(assessmentByGateId.get(gate.id)?.outcome)) {
      errors.push(
        `DEPLOY-RECORD-GATE-005 ${record.recordId}: required gate ${gate.id} has not passed`,
      );
    }
  }
}

function validateUniqueContracts(record, errors) {
  const contractIds = new Set();
  for (const contract of record.releaseSet?.contracts ?? []) {
    if (contractIds.has(contract.id)) {
      errors.push(`DEPLOY-RECORD-CONTRACT-001 ${record.recordId}: duplicate contract ${contract.id}`);
    }
    contractIds.add(contract.id);
  }
}

export function validateQualificationRecordSemantics(record, gateCatalog) {
  const errors = [];
  const gateById = new Map((gateCatalog ?? []).map((gate) => [gate.id, gate]));
  const assessmentIds = new Set();
  for (const assessment of record.assessments ?? []) {
    if (assessmentIds.has(assessment.gateId)) {
      errors.push(
        `DEPLOY-RECORD-GATE-001 ${record.recordId}: duplicate assessment for ${assessment.gateId}`,
      );
    }
    assessmentIds.add(assessment.gateId);
    validateAssessment(record, assessment, gateById, errors);
  }
  validateRequiredAssessments(record, gateCatalog, errors);
  if (Date.parse(record.reassessBy) <= Date.parse(record.assessedAt)) {
    errors.push(`DEPLOY-RECORD-TIME-001 ${record.recordId}: reassessBy must follow assessedAt`);
  }
  validateUniqueContracts(record, errors);
  return errors;
}
