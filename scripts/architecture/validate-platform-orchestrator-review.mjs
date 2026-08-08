import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = path.resolve(scriptDirectory, "../..");
const reviewDirectory = "docs/architecture/platform-orchestrator-review";
const matrixFiles = [
  "01-authority-ownership-matrix.md",
  "02-resource-identity-binding-matrix.md",
  "03-principal-delegation-model.md",
  "04-capability-authorization-port-catalog.md",
  "05-decision-freshness-failure-matrix.md",
  "06-project-provisioning-binding-state-machine.md",
  "07-deployment-administration-capability-matrix.md",
  "08-contract-conformance-ownership.md",
];
const traceFile = "concurrency-failure-traces.md";
const requiredTraceIds = [
  "CF-01",
  "CF-02",
  "CF-03",
  "CF-04",
  "CF-05",
  "RT-01",
  "RT-02",
];
const requiredTraceTerms = new Map([
  ["CF-01", ["linearization point", "crash windows", "response loss", "receipt"]],
  ["CF-02", ["concurrent", "same identity", "digest", "conflict"]],
  ["CF-03", ["stale", "linearization point", "successor", "receipt"]],
  ["CF-04", ["suspension", "admission", "commit orders", "partition"]],
  ["CF-05", ["partial", "reconciliation", "unknown", "receipt"]],
  ["RT-01", ["high-water", "target-intent", "AR command", "negative operation-intent guard"]],
  ["RT-02", ["scopeAdmissionRevision", "evidence revision", "dispatcher recheck", "AR dispatch"]],
]);
const acceptedSourcePatterns = [
  /\bPlatform ADR-0001\b/u,
  /\bPlatform ADR-0002\b/u,
  /\bPlatform ADR-0003\b/u,
  /\bPlatform ADR-0004\b/u,
  /\bPlatform ADR-0005\b/u,
  /\bOrchestrator ADR-0028\b/u,
  /\bOrchestrator ADR-0058\b/u,
  /\bOrchestrator ADR-0062\b/u,
  /\bOrchestrator ADR-0071\b/u,
  /\bOrchestrator ADR-0079\b/u,
  /\bOrchestrator ADR-0080\b/u,
  /\bAR ADR-0001\b/u,
  /\bAR ADR-0002\b/u,
  /\bAR ADR-0003\b/u,
  /\bAR ADR-0004\b/u,
];
const stalePhrases = [
  "Revalidate immediately before effect",
  "both race orders",
  "| V1 qualification |",
  "| Design only |",
  "AR must accept and publish the runtime-scope provisioning",
];

function markdownFrontmatter(source) {
  const match = source.match(
    /^---\r?\n(?<yaml>[\s\S]*?)\r?\n---(?:\r?\n|$)/u,
  );
  if (!match?.groups?.yaml) {
    return null;
  }
  try {
    return YAML.parse(match.groups.yaml);
  } catch {
    return null;
  }
}

function tableCells(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
    return null;
  }
  return trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
}

function stripFencedCodeBlocks(content) {
  let fence = null;
  const withoutComments = content.replaceAll(
    /<!--[\s\S]*?(?:-->|$)/gu,
    (comment) => comment.replaceAll(/[^\n]/gu, ""),
  );
  return withoutComments
    .split("\n")
    .map((line) => {
      if (fence === null) {
        const opening = line.match(/^ {0,3}(?<marker>`{3,}|~{3,})(?<info>.*)$/u);
        if (!opening?.groups?.marker) {
          return line;
        }
        if (
          opening.groups.marker[0] === "`" &&
          opening.groups.info.includes("`")
        ) {
          return line;
        }
        fence = {
          character: opening.groups.marker[0],
          length: opening.groups.marker.length,
        };
        return "";
      }
      const closing = line.match(/^ {0,3}(?<marker>`{3,}|~{3,})[ \t]*$/u);
      if (
        closing?.groups?.marker?.[0] === fence.character &&
        closing.groups.marker.length >= fence.length
      ) {
        fence = null;
      }
      return "";
    })
    .join("\n");
}

function normalizedHeaderCell(cell) {
  return cell
    .replaceAll(/<[^>]+>/gu, "")
    .replaceAll(/\[(.+?)\]\((.*?)\)/gu, "$1")
    .replaceAll(/[`*_~]/gu, "")
    .trim()
    .toLowerCase();
}

function secondLevelSection(content, traceId) {
  const heading = new RegExp(`^## ${traceId}\\b[^\\n]*$`, "mu");
  const match = heading.exec(content);
  if (!match) {
    return null;
  }
  const bodyStart = content.indexOf("\n", match.index) + 1;
  const remainder = content.slice(bodyStart);
  const nextHeading = remainder.search(/^##\s+/mu);
  return nextHeading === -1 ? remainder : remainder.slice(0, nextHeading);
}

export function validateReviewDocuments(documents) {
  const errors = [];

  for (const file of matrixFiles) {
    const content = documents.get(file);
    if (content === undefined) {
      errors.push(`REVIEW-ARTIFACT-001 missing ${file}`);
      continue;
    }
    if (markdownFrontmatter(content)?.status !== "proposed") {
      errors.push(`REVIEW-STATUS-001 ${file} must remain proposed`);
    }
  }

  for (const file of matrixFiles) {
    const content = documents.get(file);
    if (content === undefined) {
      continue;
    }
    const visibleContent = stripFencedCodeBlocks(content);
    if (!visibleContent.includes("Acceptance source")) {
      errors.push(`REVIEW-SOURCE-001 ${file} lacks an acceptance-source boundary`);
    }
    const lines = visibleContent.split("\n");
    let statusColumnIndexes = [];
    let foundStatusTable = false;
    for (const [lineIndex, line] of lines.entries()) {
      const cells = tableCells(line);
      if (!cells) {
        statusColumnIndexes = [];
        if (!/\bCONFIRMED\b/u.test(line)) {
          continue;
        }
        if (!/^\s*-\s+`CONFIRMED`:/u.test(line)) {
          errors.push(
            `REVIEW-STATUS-004 ${file} has an unvalidated prose CONFIRMED claim: ${line}`,
          );
          continue;
        }
        const paragraph = [line];
        for (let next = lineIndex + 1; next < lines.length; next += 1) {
          if (/^\s*(?:$|[-#|])/u.test(lines[next])) {
            break;
          }
          paragraph.push(lines[next]);
        }
        const claim = paragraph.join("\n");
        if (!acceptedSourcePatterns.some((source) => source.test(claim))) {
          errors.push(
            `REVIEW-CONFIRMED-003 ${file} has prose CONFIRMED without accepted evidence: ${line}`,
          );
        }
        continue;
      }
      const nextCells = tableCells(lines[lineIndex + 1] ?? "");
      const isHeader =
        nextCells !== null &&
        nextCells.length === cells.length &&
        nextCells.every((cell) => /^:?-{3,}:?$/u.test(cell));
      const headerIndexes = isHeader
        ? cells.flatMap((cell, index) =>
            ["status", "semantic status", "representation status"].includes(
              normalizedHeaderCell(cell),
            )
              ? [index]
              : [],
          )
        : [];
      if (headerIndexes.length > 0) {
        foundStatusTable = true;
        for (const index of headerIndexes) {
          if (
            !["Status", "Semantic status", "Representation status"].includes(
              cells[index],
            )
          ) {
            errors.push(
              `REVIEW-STATUS-006 ${file} has a non-canonical status header: ${cells[index]}`,
            );
          }
        }
        statusColumnIndexes = headerIndexes;
        continue;
      }
      if (cells.every((cell) => /^:?-{3,}:?$/u.test(cell))) {
        continue;
      }
      if (statusColumnIndexes.length === 0) {
        if (cells.some((cell) => /\bCONFIRMED\b/u.test(cell))) {
          errors.push(
            `REVIEW-STATUS-007 ${file} has CONFIRMED in a table without a canonical status column: ${line}`,
          );
        }
        continue;
      }
      const statusCells = statusColumnIndexes.map((index) => cells[index] ?? "");
      for (const statusCell of statusCells) {
        if (!/^`(?:CONFIRMED|PROPOSED|OPEN|OUT_OF_SCOPE)`$/u.test(statusCell)) {
          errors.push(
            `REVIEW-STATUS-003 ${file} has non-canonical status cell: ${statusCell}`,
          );
        }
      }
      if (
        cells.some(
          (cell, index) =>
            !statusColumnIndexes.includes(index) && /\bCONFIRMED\b/u.test(cell),
        )
      ) {
        errors.push(
          `REVIEW-STATUS-007 ${file} has CONFIRMED outside a canonical status cell: ${line}`,
        );
      }
      if (!statusCells.some((cell) => /\bCONFIRMED\b/u.test(cell))) {
        continue;
      }
      const sourceCell = cells.at(-1) ?? "";
      if (!acceptedSourcePatterns.some((source) => source.test(sourceCell))) {
        errors.push(
          `REVIEW-CONFIRMED-001 ${file} has CONFIRMED without accepted evidence: ${line}`,
        );
      }
      if (/Review proposal/u.test(line)) {
        errors.push(
          `REVIEW-CONFIRMED-002 ${file} confirms review-only evidence: ${line}`,
        );
      }
    }
    if (!foundStatusTable) {
      errors.push(`REVIEW-STATUS-005 ${file} lacks a canonical status table`);
    }
  }

  const traces = documents.get(traceFile);
  if (traces === undefined) {
    errors.push(`REVIEW-TRACE-001 missing ${traceFile}`);
  } else {
    if (markdownFrontmatter(traces)?.status !== "proposed") {
      errors.push(`REVIEW-STATUS-002 ${traceFile} must remain proposed`);
    }
    const visibleTraces = stripFencedCodeBlocks(traces);
    for (const traceId of requiredTraceIds) {
      const section = secondLevelSection(visibleTraces, traceId);
      if (section === null) {
        errors.push(`REVIEW-TRACE-002 missing ${traceId}`);
        continue;
      }
      if (section.length < 300 || !/^\d+\.\s+|^\|\s+/mu.test(section)) {
        errors.push(`REVIEW-TRACE-004 ${traceId} lacks a substantive trace`);
      }
      for (const requiredTerm of requiredTraceTerms.get(traceId) ?? []) {
        if (!section.toLowerCase().includes(requiredTerm.toLowerCase())) {
          errors.push(
            `REVIEW-TRACE-006 ${traceId} lacks required semantic term: ${requiredTerm}`,
          );
        }
      }
      const evidenceHeading = `### ${traceId} conformance evidence`;
      const evidenceStart = section.indexOf(evidenceHeading);
      if (evidenceStart === -1) {
        errors.push(`REVIEW-TRACE-003 ${traceId} lacks conformance evidence`);
        continue;
      }
      const evidenceRemainder = section.slice(
        evidenceStart + evidenceHeading.length,
      );
      const nextSubheading = evidenceRemainder.search(/^###\s+/mu);
      const evidence =
        nextSubheading === -1
          ? evidenceRemainder
          : evidenceRemainder.slice(0, nextSubheading);
      const evidenceItems = evidence.match(/^-\s+\S+/gmu) ?? [];
      if (evidence.length < 80 || evidenceItems.length < 3) {
        errors.push(`REVIEW-TRACE-005 ${traceId} has empty conformance evidence`);
      }
    }
  }

  const combined = [...documents.values()].join("\n");
  for (const phrase of stalePhrases) {
    if (combined.includes(phrase)) {
      errors.push(`REVIEW-STALE-001 obsolete wording remains: ${phrase}`);
    }
  }

  const index = documents.get("README.md") ?? "";
  if (!index.includes(`(${traceFile})`)) {
    errors.push("REVIEW-INDEX-001 review index must link the failure traces");
  }

  const profileManifest = documents.get("../deployment-profiles.yaml") ?? "";
  let profileCatalog;
  try {
    profileCatalog = YAML.parse(profileManifest);
  } catch (error) {
    errors.push(`REVIEW-EVIDENCE-000 invalid deployment manifest: ${error.message}`);
  }
  const evidenceSets = Array.isArray(profileCatalog?.designEvidenceSets)
    ? profileCatalog.designEvidenceSets.filter(
        (evidenceSet) =>
          evidenceSet !== null &&
          typeof evidenceSet === "object" &&
          !Array.isArray(evidenceSet),
      )
    : [];
  if (!Array.isArray(profileCatalog?.designEvidenceSets)) {
    errors.push(
      "REVIEW-EVIDENCE-003 deployment manifest designEvidenceSets must be an array",
    );
  } else if (evidenceSets.length !== profileCatalog.designEvidenceSets.length) {
    errors.push(
      "REVIEW-EVIDENCE-006 deployment manifest designEvidenceSets contains a non-object entry",
    );
  }
  const evidenceSetsById = new Map(
    evidenceSets.map((evidenceSet) => [evidenceSet.id, evidenceSet]),
  );
  const activeEvidenceSetIds = new Set();
  const visitEvidenceSet = (evidenceSetId) => {
    if (activeEvidenceSetIds.has(evidenceSetId)) {
      return;
    }
    const evidenceSet = evidenceSetsById.get(evidenceSetId);
    if (!evidenceSet) {
      return;
    }
    activeEvidenceSetIds.add(evidenceSetId);
    for (const parentId of Array.isArray(evidenceSet.extendsEvidenceSetIds)
      ? evidenceSet.extendsEvidenceSetIds
      : []) {
      visitEvidenceSet(parentId);
    }
  };
  const profiles = Array.isArray(profileCatalog?.profiles)
    ? profileCatalog.profiles.filter(
        (profile) =>
          profile !== null && typeof profile === "object" && !Array.isArray(profile),
      )
    : [];
  if (!Array.isArray(profileCatalog?.profiles)) {
    errors.push("REVIEW-EVIDENCE-005 deployment manifest profiles must be an array");
  } else if (profiles.length !== profileCatalog.profiles.length) {
    errors.push(
      "REVIEW-EVIDENCE-007 deployment manifest profiles contains a non-object entry",
    );
  }
  for (const profile of profiles) {
    visitEvidenceSet(profile.designEvidenceSetId);
  }
  for (const evidenceSet of evidenceSets) {
    if (
      (evidenceSet.reviewInputRefs?.length ?? 0) > 0 &&
      !activeEvidenceSetIds.has(evidenceSet.id)
    ) {
      errors.push(
        `REVIEW-EVIDENCE-004 ${evidenceSet.id} contains review inputs but is not referenced by any profile evidence lineage`,
      );
    }
  }
  const activeEvidenceSets = evidenceSets.filter((evidenceSet) =>
    activeEvidenceSetIds.has(evidenceSet.id),
  );
  const reviewInputs = new Set(
    activeEvidenceSets.flatMap(
      (evidenceSet) => evidenceSet.reviewInputRefs ?? [],
    ),
  );
  for (const file of [...matrixFiles, traceFile]) {
    const requiredPath = `${reviewDirectory}/${file}`;
    if (!reviewInputs.has(requiredPath)) {
      errors.push(
        `REVIEW-EVIDENCE-001 deployment review inputs must include ${requiredPath}`,
      );
    }
  }
  const acceptedEvidence = new Set(
    activeEvidenceSets.flatMap((evidenceSet) => evidenceSet.evidenceRefs ?? []),
  );
  if (
    [...acceptedEvidence].some((item) =>
      item.startsWith(`${reviewDirectory}/`),
    )
  ) {
    errors.push(
      "REVIEW-EVIDENCE-002 proposed review artifacts cannot be accepted design evidence",
    );
  }

  return errors;
}

export async function loadReviewDocuments(repositoryRoot) {
  const documents = new Map();
  for (const file of [...matrixFiles, traceFile, "README.md"]) {
    try {
      documents.set(
        file,
        await readFile(path.join(repositoryRoot, reviewDirectory, file), "utf8"),
      );
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }
  try {
    documents.set(
      "../deployment-profiles.yaml",
      await readFile(
        path.join(
          repositoryRoot,
          "architecture/deployment-profiles/deployment-profiles.yaml",
        ),
        "utf8",
      ),
    );
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
  return documents;
}

export async function validatePlatformOrchestratorReview(repositoryRoot) {
  return validateReviewDocuments(await loadReviewDocuments(repositoryRoot));
}

async function main() {
  const errors = await validatePlatformOrchestratorReview(defaultRepositoryRoot);
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error);
    }
    process.exitCode = 1;
    return;
  }
  console.log("Platform-Orchestrator review validation passed.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
