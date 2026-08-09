import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  assertScaffoldPlanDigest,
  planScaffoldFromFile,
  readScaffoldPlanFile,
  validateScaffoldReceipt,
} from "@agent-teams/engineering-foundation/scaffolding";

import { readText } from "./platform-domain-documents.mjs";

const scaffoldEvidenceRoots = [
  "architecture/scaffolding/intents",
  "architecture/scaffolding/plans",
  "architecture/scaffolding/receipts",
];

async function pathKind(repositoryRoot, relativePath) {
  let currentPath = repositoryRoot;
  for (const segment of relativePath.split("/")) {
    currentPath = path.join(currentPath, segment);
    try {
      if ((await lstat(currentPath)).isSymbolicLink()) {
        return "symlink";
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        return "absent";
      }
      throw error;
    }
  }
  const value = await lstat(path.join(repositoryRoot, relativePath));
  return value.isDirectory() ? "directory" : value.isFile() ? "file" : "other";
}

async function readJson(repositoryRoot, relativePath, errors) {
  const source = await readText(repositoryRoot, relativePath, errors);
  if (source === null) {
    return null;
  }
  try {
    return JSON.parse(source);
  } catch (error) {
    errors.push(`DOMAIN-JSON-001 ${relativePath}: ${error.message}`);
    return null;
  }
}

function reproduciblePlanProjection(plan) {
  return {
    schemaVersion: plan.schemaVersion,
    protocolVersion: plan.protocolVersion,
    compiler: plan.compiler,
    intent: plan.intent,
    intentDigest: plan.intentDigest,
    composition: plan.composition,
    definitions: plan.definitions,
    resolved: plan.resolved,
    operations: plan.operations,
    diagnostics: plan.diagnostics,
    projectId: plan.projectId,
    authority: plan.authority,
    target: plan.target,
  };
}

export async function validateScaffoldEvidence(repositoryRoot, target, errors) {
  const planPath = `architecture/scaffolding/plans/${target.id}.json`;
  const receiptPath = `architecture/scaffolding/receipts/${target.id}.json`;
  if ((await pathKind(repositoryRoot, planPath)) !== "file") {
    errors.push(`DOMAIN-PLAN-002 required regular Plan: ${planPath}`);
    return;
  }
  if ((await pathKind(repositoryRoot, receiptPath)) !== "file") {
    errors.push(`DOMAIN-PLAN-003 required regular Receipt: ${receiptPath}`);
    return;
  }
  let plan;
  try {
    plan = await readScaffoldPlanFile(repositoryRoot, planPath);
    assertScaffoldPlanDigest(plan);
  } catch (error) {
    errors.push(`DOMAIN-PLAN-002 ${planPath}: ${error.message}`);
    return;
  }
  try {
    const reproduced = await planScaffoldFromFile({
      consumerRoot: repositoryRoot,
      intentPath: `architecture/scaffolding/intents/${target.id}.yaml`,
    });
    if (
      !isDeepStrictEqual(
        reproduciblePlanProjection(plan),
        reproduciblePlanProjection(reproduced),
      )
    ) {
      errors.push(`DOMAIN-PLAN-006 compiler reproduction mismatch: ${target.id}`);
    }
  } catch (error) {
    errors.push(`DOMAIN-PLAN-006 cannot reproduce ${target.id}: ${error.message}`);
  }
  const receiptSource = await readJson(repositoryRoot, receiptPath, errors);
  if (receiptSource === null) {
    return;
  }
  let receipt;
  try {
    receipt = await validateScaffoldReceipt(receiptSource, plan);
  } catch (error) {
    errors.push(`DOMAIN-PLAN-003 ${receiptPath}: ${error.message}`);
    return;
  }
  const targetMatches =
    plan.target.id === target.id &&
    plan.target.role === target.role &&
    plan.target.path === target.path &&
    plan.target.packageName === target.package_name &&
    plan.target.ownerDocument.id === target.owner_document &&
    plan.authorityEvidence.ownerDocument.status === "accepted";
  if (!targetMatches) {
    errors.push(`DOMAIN-PLAN-004 plan target mismatch: ${target.id}`);
  }
  if (
    !["already-applied", "applied"].includes(receipt.outcome) ||
    receipt.commit.state !== "committed"
  ) {
    errors.push(`DOMAIN-PLAN-005 scaffold not committed: ${target.id}`);
  }
}

export async function validateScaffoldEvidenceInventory(
  repositoryRoot,
  targets,
  dossiersById,
  errors,
) {
  const expected = new Set(
    targets
      .filter((target) =>
        dossiersById.get(target.owner_document)?.metadata?.status === "accepted"
      )
      .map((target) => `${target.id}.json`),
  );
  for (const relativeRoot of scaffoldEvidenceRoots) {
    const kind = await pathKind(repositoryRoot, relativeRoot);
    if (kind === "absent" && expected.size === 0) {
      continue;
    }
    if (kind !== "directory") {
      errors.push(`DOMAIN-PLAN-007 invalid evidence root: ${relativeRoot}`);
      continue;
    }
    const entries = await readdir(path.join(repositoryRoot, relativeRoot), {
      withFileTypes: true,
    });
    const suffix = relativeRoot.endsWith("/intents") ? ".yaml" : ".json";
    const expectedFiles = new Set(
      [...expected].map((file) => file.replace(/\.json$/u, suffix)),
    );
    for (const entry of entries) {
      if (!entry.isFile() || !expectedFiles.has(entry.name)) {
        errors.push(
          `DOMAIN-PLAN-007 orphan scaffold evidence: ${relativeRoot}/${entry.name}`,
        );
      }
    }
  }
}
