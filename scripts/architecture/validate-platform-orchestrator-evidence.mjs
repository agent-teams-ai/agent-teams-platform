import YAML from "yaml";

function parseProfileCatalog(documents, errors) {
  try {
    return YAML.parse(documents.get("../deployment-profiles.yaml") ?? "");
  } catch (error) {
    errors.push(`REVIEW-EVIDENCE-000 invalid deployment manifest: ${error.message}`);
    return null;
  }
}

function objectEntries(value, field, missingCode, invalidCode, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${missingCode} deployment manifest ${field} must be an array`);
    return [];
  }
  const entries = value.filter(
    (entry) => entry !== null && typeof entry === "object" && !Array.isArray(entry),
  );
  if (entries.length !== value.length) {
    errors.push(`${invalidCode} deployment manifest ${field} contains a non-object entry`);
  }
  return entries;
}

function collectActiveEvidenceSetIds(evidenceSetsById, profiles) {
  const activeIds = new Set();
  const pendingIds = profiles.map((profile) => profile.designEvidenceSetId);
  while (pendingIds.length > 0) {
    const evidenceSetId = pendingIds.pop();
    if (activeIds.has(evidenceSetId)) {
      continue;
    }
    const evidenceSet = evidenceSetsById.get(evidenceSetId);
    if (!evidenceSet) {
      continue;
    }
    activeIds.add(evidenceSetId);
    pendingIds.push(
      ...(Array.isArray(evidenceSet.extendsEvidenceSetIds)
        ? evidenceSet.extendsEvidenceSetIds
        : []),
    );
  }
  return activeIds;
}

function validateInactiveReviewInputs(evidenceSets, activeIds, errors) {
  for (const evidenceSet of evidenceSets) {
    if (
      (evidenceSet.reviewInputRefs?.length ?? 0) > 0 &&
      !activeIds.has(evidenceSet.id)
    ) {
      errors.push(
        `REVIEW-EVIDENCE-004 ${evidenceSet.id} contains review inputs but is not referenced by any profile evidence lineage`,
      );
    }
  }
}

function validateRequiredReviewInputs(
  activeEvidenceSets,
  matrixFiles,
  reviewDirectory,
  traceFile,
  errors,
) {
  const reviewInputs = new Set(
    activeEvidenceSets.flatMap((evidenceSet) => evidenceSet.reviewInputRefs ?? []),
  );
  for (const file of [...matrixFiles, traceFile]) {
    const requiredPath = `${reviewDirectory}/${file}`;
    if (!reviewInputs.has(requiredPath)) {
      errors.push(
        `REVIEW-EVIDENCE-001 deployment review inputs must include ${requiredPath}`,
      );
    }
  }
}

function validateNoAcceptedReviewArtifacts(
  activeEvidenceSets,
  reviewDirectory,
  errors,
) {
  const acceptedEvidence = activeEvidenceSets.flatMap(
    (evidenceSet) => evidenceSet.evidenceRefs ?? [],
  );
  if (acceptedEvidence.some((item) => item.startsWith(`${reviewDirectory}/`))) {
    errors.push(
      "REVIEW-EVIDENCE-002 proposed review artifacts cannot be accepted design evidence",
    );
  }
}

export function validateReviewEvidence(
  documents,
  { matrixFiles, reviewDirectory, traceFile },
) {
  const errors = [];
  const profileCatalog = parseProfileCatalog(documents, errors);
  const evidenceSets = objectEntries(
    profileCatalog?.designEvidenceSets,
    "designEvidenceSets",
    "REVIEW-EVIDENCE-003",
    "REVIEW-EVIDENCE-006",
    errors,
  );
  const profiles = objectEntries(
    profileCatalog?.profiles,
    "profiles",
    "REVIEW-EVIDENCE-005",
    "REVIEW-EVIDENCE-007",
    errors,
  );
  const evidenceSetsById = new Map(
    evidenceSets.map((evidenceSet) => [evidenceSet.id, evidenceSet]),
  );
  const activeIds = collectActiveEvidenceSetIds(evidenceSetsById, profiles);
  validateInactiveReviewInputs(evidenceSets, activeIds, errors);
  const activeEvidenceSets = evidenceSets.filter((evidenceSet) =>
    activeIds.has(evidenceSet.id),
  );
  validateRequiredReviewInputs(
    activeEvidenceSets,
    matrixFiles,
    reviewDirectory,
    traceFile,
    errors,
  );
  validateNoAcceptedReviewArtifacts(activeEvidenceSets, reviewDirectory, errors);
  return errors;
}
