import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import Ajv2020 from "ajv/dist/2020.js";

import {
  DOSSIER_ROOT,
  loadDossiers,
  loadMarkdown,
  loadYaml,
} from "./platform-domain-documents.mjs";
import { validateMaterialization } from "./platform-domain-materialization.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = path.resolve(scriptDirectory, "../..");
const catalogPath = "architecture/package-catalog.yaml";
const scaffoldingPath = "architecture/foundation/scaffolding.yaml";
const contextMapPath = "docs/domain/context-map.md";
const dossierIndexPath = `${DOSSIER_ROOT}/README.md`;
const productDecisionPacketPath = "docs/domain/product-decision-packet.md";
const productDecisionIds = [
  "PO-PLAT-001",
  "PO-PLAT-002",
  "PO-PLAT-003",
  "PO-PLAT-004",
  "PO-PLAT-005",
  "PO-PLAT-006",
  "PO-PLAT-007",
];
const requiredProductDecisionSections = [
  "Recommendation",
  "Product Contract",
  "Explicitly Unsupported in V1",
  "Consequences",
  "Product-Owner Confirmation",
];
const requiredScaffoldingPolicy = {
  schemaVersion: 1,
  projectId: "agent-teams-platform",
  targetCatalogPath: catalogPath,
  compositions: [
    {
      id: "platform-private-context",
      scaffoldProfile: {
        ref: {
          id: "foundation.node-typescript-pnpm-esm",
          contractVersion: 1,
        },
        parameters: { tsconfigBase: "tsconfig.json" },
      },
      recipe: {
        ref: {
          id: "foundation.node-typescript-library-boundary",
          contractVersion: 1,
        },
      },
      targetRoles: ["bounded-context"],
      authorityVerifiers: [
        {
          id: "foundation.markdown-yaml-owner",
          contractVersion: 1,
          parameters: {
            allowedStatuses: ["accepted"],
            documentRoots: [DOSSIER_ROOT],
          },
        },
      ],
      policies: [],
    },
  ],
};
const requiredHeadings = [
  "Ubiquitous Language",
  "Ownership",
  "System of Record",
  "Aggregates",
  "Invariants",
  "Lifecycle",
  "Commands and Events",
  "Features",
  "Dependencies",
  "Integration",
  "Published Language",
  "Forbidden Dependencies",
  "Not Owned",
  "Materialization Gate",
  "Open Decisions",
];

async function schemaValidator(schemaSpecifier) {
  const schema = JSON.parse(
    await readFile(new URL(import.meta.resolve(schemaSpecifier)), "utf8"),
  );
  return new Ajv2020({ allErrors: true, strict: true }).compile(schema);
}

const validatorsPromise = Promise.all([
  schemaValidator(
    "@agent-teams/engineering-foundation/schemas/scaffold-target-catalog/v1.schema.json",
  ),
  schemaValidator(
    "@agent-teams/engineering-foundation/schemas/scaffolding-config/v1.schema.json",
  ),
]);

function validateSchema(value, validator, subject, errors) {
  if (value === null || validator(value)) {
    return;
  }
  for (const error of validator.errors ?? []) {
    errors.push(
      `DOMAIN-SCHEMA-001 ${subject}${error.instancePath}: ${error.message}`,
    );
  }
}

function duplicateValues(items, selector) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of items) {
    const value = selector(item);
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }
  return [...duplicates].toSorted();
}

function validateUniqueFields(items, fields, subject, errors) {
  for (const field of fields) {
    for (const duplicate of duplicateValues(items, (item) => item[field])) {
      errors.push(`DOMAIN-${subject}-001 duplicate ${field}: ${duplicate}`);
    }
  }
}

function validateDossierShape(dossier, errors) {
  const metadata = dossier.metadata;
  if (metadata === null) {
    return;
  }
  if (metadata.type !== "bounded-context") {
    errors.push(`DOMAIN-DOSSIER-002 ${dossier.path} must be bounded-context`);
  }
  if (!["accepted", "proposed"].includes(metadata.status)) {
    errors.push(`DOMAIN-DOSSIER-003 ${dossier.path} has invalid status`);
  }
  for (const field of [
    "id",
    "owner",
    "classification",
    "package_target",
    "summary",
  ]) {
    if (typeof metadata[field] !== "string" || metadata[field].length === 0) {
      errors.push(`DOMAIN-DOSSIER-004 ${dossier.path} lacks ${field}`);
    }
  }
  if (
    metadata.id !== `domain.contexts.${dossier.slug}` ||
    metadata.package_target !== `context.${dossier.slug}`
  ) {
    errors.push(`DOMAIN-DOSSIER-006 ${dossier.path} violates identity convention`);
  }
  for (const heading of requiredHeadings) {
    if (!dossier.headings.has(heading)) {
      errors.push(`DOMAIN-DOSSIER-005 ${dossier.path} lacks ${heading}`);
    }
  }
}

function validateDossierIdentities(dossiers, errors) {
  const metadata = dossiers
    .map((dossier) => dossier.metadata)
    .filter((item) => item !== null);
  validateUniqueFields(metadata, ["id", "package_target"], "DOSSIER", errors);
}

function validateCatalogBindings(catalog, dossiers, errors) {
  const packages = Array.isArray(catalog?.packages) ? catalog.packages : [];
  validateUniqueFields(
    packages,
    ["id", "path", "package_name", "owner_document"],
    "CATALOG",
    errors,
  );
  const dossiersById = new Map(
    dossiers
      .filter((dossier) => typeof dossier.metadata?.id === "string")
      .map((dossier) => [dossier.metadata.id, dossier]),
  );
  for (const target of packages) {
    const dossier = dossiersById.get(target.owner_document);
    if (dossier === undefined) {
      errors.push(
        `DOMAIN-CATALOG-002 ${target.id} has no owner ${target.owner_document}`,
      );
      continue;
    }
    const expected = {
      id: `context.${dossier.slug}`,
      name: `@agent-teams/platform-${dossier.slug}`,
      path: `packages/contexts/${dossier.slug}`,
    };
    if (
      target.id !== expected.id ||
      target.path !== expected.path ||
      target.package_name !== expected.name ||
      target.role !== "bounded-context"
    ) {
      errors.push(`DOMAIN-CATALOG-003 ${target.id} violates package convention`);
    }
    if (dossier.metadata?.package_target !== target.id) {
      errors.push(`DOMAIN-CATALOG-004 ${dossier.path} target mismatch`);
    }
  }
  for (const dossier of dossiers) {
    if (!packages.some((target) => target.owner_document === dossier.metadata?.id)) {
      errors.push(`DOMAIN-CATALOG-005 ${dossier.path} lacks package reservation`);
    }
  }
}

function validateScaffoldingPolicy(config, errors) {
  if (!isDeepStrictEqual(config, requiredScaffoldingPolicy)) {
    errors.push(
      "DOMAIN-SCAFFOLD-001 scaffolding must admit only accepted bounded-context owners",
    );
  }
}

function validateNavigation(contextMap, index, dossiers, errors) {
  for (const dossier of dossiers) {
    const contextLink = `contexts/${dossier.slug}/README.md`;
    if (!contextMap?.links.has(contextLink)) {
      errors.push(`DOMAIN-NAV-001 context map lacks ${contextLink}`);
    }
    if (!index?.links.has(`${dossier.slug}/README.md`)) {
      errors.push(`DOMAIN-NAV-002 dossier index lacks ${dossier.slug}`);
    }
  }
  if (!contextMap?.links.has("../../architecture/package-catalog.yaml")) {
    errors.push("DOMAIN-NAV-003 context map lacks package catalog link");
  }
  if (!contextMap?.links.has("product-decision-packet.md")) {
    errors.push("DOMAIN-NAV-004 context map lacks product decision packet");
  }
}

function decisionSubheadings(packet, decisionId) {
  const start = packet.rootHeadings.findIndex(
    (heading) => heading.depth === 2 && heading.text.startsWith(`${decisionId}:`),
  );
  if (start === -1) {
    return null;
  }
  const next = packet.rootHeadings.findIndex(
    (heading, index) => index > start && heading.depth === 2,
  );
  return new Set(
    packet.rootHeadings
      .slice(start + 1, next === -1 ? undefined : next)
      .filter((heading) => heading.depth === 3)
      .map((heading) => heading.text),
  );
}

function validateProductDecisionPacket(packet, errors) {
  const metadata = packet?.metadata;
  if (
    metadata?.id !== "domain.product-decision-packet" ||
    metadata?.type !== "product-decision-packet" ||
    metadata?.status !== "proposed" ||
    metadata?.owner !== "product-owner"
  ) {
    errors.push("DOMAIN-PO-001 product decision packet metadata is invalid");
    return;
  }
  const decisions = metadata.decisions;
  const actualIds =
    typeof decisions === "object" && decisions !== null
      ? Object.keys(decisions).toSorted()
      : [];
  if (!isDeepStrictEqual(actualIds, [...productDecisionIds].toSorted())) {
    errors.push("DOMAIN-PO-002 product decision packet must contain exactly PO-PLAT-001...007");
  }
  const headingIds = packet.rootHeadings
    .filter((heading) => heading.depth === 2)
    .map((heading) => heading.text.match(/^(PO-PLAT-\d{3}):/u)?.[1])
    .filter((decisionId) => decisionId !== undefined)
    .toSorted();
  if (!isDeepStrictEqual(headingIds, [...productDecisionIds].toSorted())) {
    errors.push(
      "DOMAIN-PO-004 product decision packet must define each PO-PLAT-001...007 exactly once",
    );
  }
  for (const decisionId of productDecisionIds) {
    if (decisions?.[decisionId] !== "awaiting-product-owner") {
      errors.push(`DOMAIN-PO-003 ${decisionId} must remain awaiting-product-owner`);
    }
    const subheadings = decisionSubheadings(packet, decisionId);
    if (subheadings === null) {
      continue;
    }
    for (const heading of requiredProductDecisionSections) {
      if (!subheadings.has(heading)) {
        errors.push(`DOMAIN-PO-005 ${decisionId} lacks ${heading}`);
      }
    }
  }
}

export async function validatePlatformDomain(repositoryRoot) {
  const errors = [];
  const [catalogValidator, scaffoldingValidator] = await validatorsPromise;
  const [catalog, scaffolding, dossiers, contextMap, index, productDecisions] =
    await Promise.all([
      loadYaml(repositoryRoot, catalogPath, errors),
      loadYaml(repositoryRoot, scaffoldingPath, errors),
      loadDossiers(repositoryRoot, errors),
      loadMarkdown(repositoryRoot, contextMapPath, errors),
      loadMarkdown(repositoryRoot, dossierIndexPath, errors),
      loadMarkdown(repositoryRoot, productDecisionPacketPath, errors),
    ]);
  validateSchema(catalog, catalogValidator, catalogPath, errors);
  validateSchema(scaffolding, scaffoldingValidator, scaffoldingPath, errors);
  for (const dossier of dossiers) {
    validateDossierShape(dossier, errors);
  }
  validateDossierIdentities(dossiers, errors);
  validateCatalogBindings(catalog, dossiers, errors);
  validateScaffoldingPolicy(scaffolding, errors);
  await validateMaterialization(repositoryRoot, catalog, dossiers, errors);
  validateNavigation(contextMap, index, dossiers, errors);
  validateProductDecisionPacket(productDecisions, errors);
  return errors;
}

async function main() {
  const errors = await validatePlatformDomain(defaultRepositoryRoot);
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error);
    }
    process.exitCode = 1;
    return;
  }
  console.log("Platform domain architecture validation passed.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
