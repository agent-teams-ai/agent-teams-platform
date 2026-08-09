import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

import { validateReviewEvidence } from "./validate-platform-orchestrator-evidence.mjs";

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
  /\bPlatform ADR-0007\b/u,
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
  /\bAR ADR-0005\b/u,
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

function validateMatrixArtifacts(documents, errors) {
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
}

function isDividerRow(cells) {
  return cells.every((cell) => /^:?-{3,}:?$/u.test(cell));
}

function collectProseClaim(lines, lineIndex) {
  const paragraph = [lines[lineIndex]];
  for (let next = lineIndex + 1; next < lines.length; next += 1) {
    if (/^\s*(?:$|[-#|])/u.test(lines[next])) {
      break;
    }
    paragraph.push(lines[next]);
  }
  return paragraph.join("\n");
}

function validateProseConfirmed(file, lines, lineIndex, errors) {
  const line = lines[lineIndex];
  if (!/\bCONFIRMED\b/u.test(line)) {
    return;
  }
  if (!/^\s*-\s+`CONFIRMED`:/u.test(line)) {
    errors.push(
      `REVIEW-STATUS-004 ${file} has an unvalidated prose CONFIRMED claim: ${line}`,
    );
    return;
  }
  const claim = collectProseClaim(lines, lineIndex);
  if (!acceptedSourcePatterns.some((source) => source.test(claim))) {
    errors.push(
      `REVIEW-CONFIRMED-003 ${file} has prose CONFIRMED without accepted evidence: ${line}`,
    );
  }
}

function statusHeaderIndexes(cells, nextCells) {
  if (
    nextCells === null ||
    nextCells.length !== cells.length ||
    !isDividerRow(nextCells)
  ) {
    return [];
  }
  const statusHeaders = ["status", "semantic status", "representation status"];
  return cells.flatMap((cell, index) =>
    statusHeaders.includes(normalizedHeaderCell(cell)) ? [index] : [],
  );
}

function validateStatusHeaders(file, cells, indexes, errors) {
  const canonicalHeaders = ["Status", "Semantic status", "Representation status"];
  for (const index of indexes) {
    if (!canonicalHeaders.includes(cells[index])) {
      errors.push(
        `REVIEW-STATUS-006 ${file} has a non-canonical status header: ${cells[index]}`,
      );
    }
  }
}

function validateUnscopedTableRow(file, line, cells, errors) {
  if (cells.some((cell) => /\bCONFIRMED\b/u.test(cell))) {
    errors.push(
      `REVIEW-STATUS-007 ${file} has CONFIRMED in a table without a canonical status column: ${line}`,
    );
  }
}

function validateStatusTableRow(file, line, cells, statusColumnIndexes, errors) {
  const statusCells = statusColumnIndexes.map((index) => cells[index] ?? "");
  for (const statusCell of statusCells) {
    if (!/^`(?:CONFIRMED|PROPOSED|OPEN|OUT_OF_SCOPE)`$/u.test(statusCell)) {
      errors.push(
        `REVIEW-STATUS-003 ${file} has non-canonical status cell: ${statusCell}`,
      );
    }
  }
  const hasConfirmedOutsideStatus = cells.some(
    (cell, index) =>
      !statusColumnIndexes.includes(index) && /\bCONFIRMED\b/u.test(cell),
  );
  if (hasConfirmedOutsideStatus) {
    errors.push(
      `REVIEW-STATUS-007 ${file} has CONFIRMED outside a canonical status cell: ${line}`,
    );
  }
  if (!statusCells.some((cell) => /\bCONFIRMED\b/u.test(cell))) {
    return;
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

function validateMatrixStatusTables(file, content, errors) {
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
      validateProseConfirmed(file, lines, lineIndex, errors);
      continue;
    }
    const headerIndexes = statusHeaderIndexes(
      cells,
      tableCells(lines[lineIndex + 1] ?? ""),
    );
    if (headerIndexes.length > 0) {
      foundStatusTable = true;
      validateStatusHeaders(file, cells, headerIndexes, errors);
      statusColumnIndexes = headerIndexes;
      continue;
    }
    if (isDividerRow(cells)) {
      continue;
    }
    if (statusColumnIndexes.length === 0) {
      validateUnscopedTableRow(file, line, cells, errors);
      continue;
    }
    validateStatusTableRow(file, line, cells, statusColumnIndexes, errors);
  }
  if (!foundStatusTable) {
    errors.push(`REVIEW-STATUS-005 ${file} lacks a canonical status table`);
  }
}

function validateMatrices(documents, errors) {
  for (const file of matrixFiles) {
    const content = documents.get(file);
    if (content !== undefined) {
      validateMatrixStatusTables(file, content, errors);
    }
  }
}

function conformanceEvidence(section, traceId) {
  const heading = `### ${traceId} conformance evidence`;
  const start = section.indexOf(heading);
  if (start === -1) {
    return null;
  }
  const remainder = section.slice(start + heading.length);
  const nextSubheading = remainder.search(/^###\s+/mu);
  return nextSubheading === -1 ? remainder : remainder.slice(0, nextSubheading);
}

function validateTraceSection(traceId, section, errors) {
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
  const evidence = conformanceEvidence(section, traceId);
  if (evidence === null) {
    errors.push(`REVIEW-TRACE-003 ${traceId} lacks conformance evidence`);
    return;
  }
  const evidenceItems = evidence.match(/^-\s+\S+/gmu) ?? [];
  if (evidence.length < 80 || evidenceItems.length < 3) {
    errors.push(`REVIEW-TRACE-005 ${traceId} has empty conformance evidence`);
  }
}

function validateTraces(documents, errors) {
  const traces = documents.get(traceFile);
  if (traces === undefined) {
    errors.push(`REVIEW-TRACE-001 missing ${traceFile}`);
    return;
  }
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
    validateTraceSection(traceId, section, errors);
  }
}

function validateStaleWordingAndIndex(documents, errors) {
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
}

export function validateReviewDocuments(documents) {
  const errors = [];
  validateMatrixArtifacts(documents, errors);
  validateMatrices(documents, errors);
  validateTraces(documents, errors);
  validateStaleWordingAndIndex(documents, errors);
  errors.push(
    ...validateReviewEvidence(documents, {
      matrixFiles,
      reviewDirectory,
      traceFile,
    }),
  );
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
