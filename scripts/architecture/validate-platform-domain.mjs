import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import Ajv2020 from "ajv/dist/2020.js";
import YAML from "yaml";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = path.resolve(scriptDirectory, "../..");
const catalogPath = "architecture/package-catalog.yaml";
const scaffoldingPath = "architecture/foundation/scaffolding.yaml";
const contextMapPath = "docs/domain/context-map.md";
const dossierIndexPath = "docs/domain/contexts/README.md";
const dossierRoot = "docs/domain/contexts";
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
            documentRoots: [dossierRoot],
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

function frontmatter(source, subject, errors) {
  const match = source.match(
    /^---\r?\n(?<yaml>[\s\S]*?)\r?\n---(?:\r?\n|$)/u,
  );
  if (!match?.groups?.yaml) {
    errors.push(`DOMAIN-DOSSIER-001 ${subject} lacks YAML frontmatter`);
    return null;
  }
  return parseYaml(match.groups.yaml, subject, errors);
}

function parseYaml(source, subject, errors) {
  const document = YAML.parseDocument(source, { uniqueKeys: true });
  for (const error of document.errors) {
    errors.push(`DOMAIN-YAML-001 ${subject}: ${error.message}`);
  }
  return document.errors.length === 0 ? document.toJS() : null;
}

async function readText(repositoryRoot, relativePath, errors) {
  try {
    return await readFile(path.join(repositoryRoot, relativePath), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      errors.push(`DOMAIN-FILE-001 missing ${relativePath}`);
      return null;
    }
    throw error;
  }
}

async function loadYaml(repositoryRoot, relativePath, errors) {
  const source = await readText(repositoryRoot, relativePath, errors);
  return source === null ? null : parseYaml(source, relativePath, errors);
}

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

async function loadDossiers(repositoryRoot, errors) {
  let entries;
  try {
    entries = await readdir(path.join(repositoryRoot, dossierRoot), {
      withFileTypes: true,
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      errors.push(`DOMAIN-FILE-001 missing ${dossierRoot}`);
      return [];
    }
    throw error;
  }
  const dossiers = [];
  for (const entry of entries.toSorted((left, right) =>
    left.name.localeCompare(right.name, "en"))) {
    if (!entry.isDirectory()) {
      continue;
    }
    const relativePath = `${dossierRoot}/${entry.name}/README.md`;
    const source = await readText(repositoryRoot, relativePath, errors);
    if (source !== null) {
      dossiers.push({
        content: source,
        metadata: frontmatter(source, relativePath, errors),
        path: relativePath,
        slug: entry.name,
      });
    }
  }
  return dossiers;
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

function validateUniqueCatalogFields(packages, errors) {
  const fields = ["id", "path", "package_name", "owner_document"];
  for (const field of fields) {
    for (const duplicate of duplicateValues(packages, (item) => item[field])) {
      errors.push(`DOMAIN-CATALOG-001 duplicate ${field}: ${duplicate}`);
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
  for (const field of ["id", "owner", "classification", "package_target"]) {
    if (typeof metadata[field] !== "string" || metadata[field].length === 0) {
      errors.push(`DOMAIN-DOSSIER-004 ${dossier.path} lacks ${field}`);
    }
  }
  for (const heading of requiredHeadings) {
    if (!dossier.content.includes(`\n## ${heading}\n`)) {
      errors.push(`DOMAIN-DOSSIER-005 ${dossier.path} lacks ${heading}`);
    }
  }
  if (
    metadata.status === "accepted" &&
    !(metadata.related ?? []).some((item) => /^ADR-\d{4}$/u.test(item))
  ) {
    errors.push(`DOMAIN-DOSSIER-006 ${dossier.path} lacks owning ADR`);
  }
}

function validateCatalogBindings(catalog, dossiers, errors) {
  const packages = Array.isArray(catalog?.packages) ? catalog.packages : [];
  validateUniqueCatalogFields(packages, errors);
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

async function pathState(repositoryRoot, relativePath) {
  try {
    const value = await stat(path.join(repositoryRoot, relativePath));
    return value.isDirectory() ? "directory" : "other";
  } catch (error) {
    if (error.code === "ENOENT") {
      return "absent";
    }
    throw error;
  }
}

async function validateMaterialization(repositoryRoot, catalog, dossiers, errors) {
  const dossierById = new Map(
    dossiers.map((dossier) => [dossier.metadata?.id, dossier]),
  );
  for (const target of catalog?.packages ?? []) {
    const state = await pathState(repositoryRoot, target.path);
    const status = dossierById.get(target.owner_document)?.metadata?.status;
    if (status !== "accepted" && state !== "absent") {
      errors.push(`DOMAIN-MATERIALIZE-001 ${target.path} owner is not accepted`);
    }
    if (status === "accepted" && state !== "directory") {
      errors.push(`DOMAIN-MATERIALIZE-002 ${target.path} must land with acceptance`);
    }
  }
}

function validateNavigation(contextMap, index, dossiers, errors) {
  for (const dossier of dossiers) {
    const contextLink = `contexts/${dossier.slug}/README.md`;
    if (!contextMap?.includes(contextLink)) {
      errors.push(`DOMAIN-NAV-001 context map lacks ${contextLink}`);
    }
    if (!index?.includes(`${dossier.slug}/README.md`)) {
      errors.push(`DOMAIN-NAV-002 dossier index lacks ${dossier.slug}`);
    }
  }
  if (!contextMap?.includes("../../architecture/package-catalog.yaml")) {
    errors.push("DOMAIN-NAV-003 context map lacks package catalog link");
  }
}

export async function validatePlatformDomain(repositoryRoot) {
  const errors = [];
  const [catalogValidator, scaffoldingValidator] = await validatorsPromise;
  const [catalog, scaffolding, dossiers, contextMap, index] = await Promise.all([
    loadYaml(repositoryRoot, catalogPath, errors),
    loadYaml(repositoryRoot, scaffoldingPath, errors),
    loadDossiers(repositoryRoot, errors),
    readText(repositoryRoot, contextMapPath, errors),
    readText(repositoryRoot, dossierIndexPath, errors),
  ]);
  validateSchema(catalog, catalogValidator, catalogPath, errors);
  validateSchema(scaffolding, scaffoldingValidator, scaffoldingPath, errors);
  for (const dossier of dossiers) {
    validateDossierShape(dossier, errors);
  }
  validateCatalogBindings(catalog, dossiers, errors);
  validateScaffoldingPolicy(scaffolding, errors);
  await validateMaterialization(repositoryRoot, catalog, dossiers, errors);
  validateNavigation(contextMap, index, dossiers, errors);
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
