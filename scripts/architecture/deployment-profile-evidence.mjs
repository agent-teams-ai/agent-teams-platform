import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

import YAML from "yaml";

const acceptedDesignEvidenceSets = new Map([
  [
    "cross-system-profile-baseline-v1",
    {
      evidenceRefs: [
        "docs/decisions/0001-deployment-profile-lifecycle-and-v1-scope.md",
        "docs/decisions/0002-personal-space-tenant-ownership.md",
        "docs/decisions/0003-subject-bound-run-revocation-policy.md",
        "docs/decisions/0004-project-retirement-authority-and-disposition.md",
        "docs/architecture/deployment-profiles.md",
      ],
      extendsEvidenceSetIds: [],
    },
  ],
  [
    "managed-byoc-control-v1",
    {
      evidenceRefs: [
        "docs/decisions/0005-managed-customer-installation-control.md",
        "docs/architecture/managed-installation-control.md",
      ],
      extendsEvidenceSetIds: ["cross-system-profile-baseline-v1"],
    },
  ],
]);

function isInsideDirectory(directory, candidate) {
  const relative = path.relative(directory, candidate);
  return (
    relative !== "" &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  );
}

async function inspectRepositoryFile(repositoryRoot, realRepositoryRoot, reference) {
  if (reference.split(/[\\/]/u).includes("..")) {
    return "unsafe parent traversal";
  }
  const candidate = path.resolve(repositoryRoot, reference);
  if (!isInsideDirectory(repositoryRoot, candidate)) {
    return "outside repository";
  }
  try {
    const [fileStat, realCandidate] = await Promise.all([
      stat(candidate),
      realpath(candidate),
    ]);
    if (!fileStat.isFile()) {
      return "not a file";
    }
    if (!isInsideDirectory(realRepositoryRoot, realCandidate)) {
      return "symlink target outside repository";
    }
    return null;
  } catch (error) {
    if (error.code === "ENOENT") {
      return "missing";
    }
    throw error;
  }
}

function markdownDocumentStatus(source) {
  const frontmatter = source.match(
    /^---\r?\n(?<yaml>[\s\S]*?)\r?\n---(?:\r?\n|$)/u,
  );
  if (!frontmatter?.groups?.yaml) {
    return null;
  }
  try {
    return YAML.parse(frontmatter.groups.yaml)?.status ?? null;
  } catch {
    return null;
  }
}

function activeEvidenceSetIds(catalog, evidenceSetsById) {
  const activeIds = new Set();
  const visit = (evidenceSetId) => {
    if (activeIds.has(evidenceSetId)) {
      return;
    }
    const evidenceSet = evidenceSetsById.get(evidenceSetId);
    if (!evidenceSet) {
      return;
    }
    activeIds.add(evidenceSetId);
    for (const parentId of evidenceSet.extendsEvidenceSetIds ?? []) {
      visit(parentId);
    }
  };
  for (const profile of catalog.profiles ?? []) {
    visit(profile.designEvidenceSetId);
  }
  return activeIds;
}

function validateAcceptedEvidenceSets(evidenceSetsById, errors) {
  for (const [evidenceSetId, acceptedDefinition] of acceptedDesignEvidenceSets) {
    const evidenceSet = evidenceSetsById.get(evidenceSetId);
    if (!evidenceSet) {
      errors.push(
        `DEPLOY-DESIGNED-008 ${evidenceSetId}: accepted design evidence set is missing`,
      );
      continue;
    }
    for (const requiredRef of acceptedDefinition.evidenceRefs) {
      if (!evidenceSet.evidenceRefs?.includes(requiredRef)) {
        errors.push(
          `DEPLOY-DESIGNED-008 ${evidenceSetId}: required accepted evidence is missing: ${requiredRef}`,
        );
      }
    }
    for (const requiredParent of acceptedDefinition.extendsEvidenceSetIds) {
      if (!evidenceSet.extendsEvidenceSetIds?.includes(requiredParent)) {
        errors.push(
          `DEPLOY-DESIGNED-008 ${evidenceSetId}: required evidence parent is missing: ${requiredParent}`,
        );
      }
    }
  }
}

function referenceOwners(evidenceSets, field) {
  const ownersByReference = new Map();
  for (const evidenceSet of evidenceSets) {
    for (const reference of evidenceSet[field] ?? []) {
      const owners = ownersByReference.get(reference) ?? [];
      owners.push(evidenceSet.id);
      ownersByReference.set(reference, owners);
    }
  }
  return ownersByReference;
}

function validateReviewOwnership(
  evidenceSets,
  activeIds,
  acceptedReferenceOwners,
  reviewReferenceOwners,
  errors,
) {
  for (const [reference, reviewOwners] of reviewReferenceOwners) {
    if (acceptedReferenceOwners.has(reference)) {
      errors.push(
        `DEPLOY-REVIEW-002 ${reviewOwners.join(",")}: ${reference} cannot be both accepted evidence and a review input`,
      );
    }
  }
  for (const evidenceSet of evidenceSets) {
    if (
      (evidenceSet.reviewInputRefs?.length ?? 0) > 0 &&
      !activeIds.has(evidenceSet.id)
    ) {
      errors.push(
        `DEPLOY-REVIEW-003 ${evidenceSet.id}: review inputs must belong to an evidence-set lineage referenced by a deployment profile`,
      );
    }
  }
}

async function validateAcceptedEvidenceReferences(
  repositoryRoot,
  realRepositoryRoot,
  evidenceSet,
  errors,
) {
  for (const evidenceRef of evidenceSet.evidenceRefs ?? []) {
    const evidencePath = path.join(repositoryRoot, evidenceRef);
    const inspection = await inspectRepositoryFile(
      repositoryRoot,
      realRepositoryRoot,
      evidenceRef,
    );
    if (inspection !== null) {
      errors.push(
        `DEPLOY-DESIGNED-002 ${evidenceSet.id}: invalid design evidence ${evidenceRef} (${inspection})`,
      );
      continue;
    }
    if (path.extname(evidenceRef) !== ".md") {
      errors.push(
        `DEPLOY-DESIGNED-007 ${evidenceSet.id}: accepted design evidence must be an accepted Markdown decision or architecture document: ${evidenceRef}`,
      );
      continue;
    }
    const status = markdownDocumentStatus(await readFile(evidencePath, "utf8"));
    if (status !== "accepted") {
      errors.push(
        `DEPLOY-DESIGNED-006 ${evidenceSet.id}: design evidence ${evidenceRef} must be accepted, found ${status ?? "no status"}`,
      );
    }
  }
}

async function validateReviewReferences(
  repositoryRoot,
  realRepositoryRoot,
  evidenceSet,
  errors,
) {
  for (const reviewInputRef of evidenceSet.reviewInputRefs ?? []) {
    const inspection = await inspectRepositoryFile(
      repositoryRoot,
      realRepositoryRoot,
      reviewInputRef,
    );
    if (inspection !== null) {
      errors.push(
        `DEPLOY-REVIEW-001 ${evidenceSet.id}: invalid review input ${reviewInputRef} (${inspection})`,
      );
    }
  }
}

async function validateImplementationReferences(
  repositoryRoot,
  realRepositoryRoot,
  profile,
  errors,
) {
  if (!["IMPLEMENTED", "QUALIFIED"].includes(profile.currentStatus)) {
    return;
  }
  const packagePaths = [
    profile.implementation.compositionRoot,
    ...(profile.implementation.adapterPackages ?? []),
  ].filter((packagePath) => typeof packagePath === "string");
  for (const packagePath of packagePaths) {
    const packageJson = path.join(packagePath, "package.json");
    const inspection = await inspectRepositoryFile(
      repositoryRoot,
      realRepositoryRoot,
      packageJson,
    );
    if (inspection !== null) {
      errors.push(
        `DEPLOY-IMPLEMENTED-002 ${profile.id}: ${packagePath} must be a materialized package`,
      );
    }
  }
  for (const evidenceRef of profile.implementation.evidence ?? []) {
    const inspection = await inspectRepositoryFile(
      repositoryRoot,
      realRepositoryRoot,
      evidenceRef,
    );
    if (inspection !== null) {
      errors.push(
        `DEPLOY-IMPLEMENTED-003 ${profile.id}: invalid implementation evidence ${evidenceRef} (${inspection})`,
      );
    }
  }
}

export async function validateDesignReferences(repositoryRoot, catalog) {
  const errors = [];
  const realRepositoryRoot = await realpath(repositoryRoot);
  const evidenceSets = catalog.designEvidenceSets ?? [];
  const evidenceSetsById = new Map(
    evidenceSets.map((evidenceSet) => [evidenceSet.id, evidenceSet]),
  );
  const activeIds = activeEvidenceSetIds(catalog, evidenceSetsById);
  const acceptedReferenceOwners = referenceOwners(evidenceSets, "evidenceRefs");
  const reviewReferenceOwners = referenceOwners(evidenceSets, "reviewInputRefs");

  validateAcceptedEvidenceSets(evidenceSetsById, errors);
  validateReviewOwnership(
    evidenceSets,
    activeIds,
    acceptedReferenceOwners,
    reviewReferenceOwners,
    errors,
  );
  for (const evidenceSet of evidenceSets) {
    await validateAcceptedEvidenceReferences(
      repositoryRoot,
      realRepositoryRoot,
      evidenceSet,
      errors,
    );
    await validateReviewReferences(
      repositoryRoot,
      realRepositoryRoot,
      evidenceSet,
      errors,
    );
  }
  for (const profile of catalog.profiles ?? []) {
    await validateImplementationReferences(
      repositoryRoot,
      realRepositoryRoot,
      profile,
      errors,
    );
  }
  return errors;
}
