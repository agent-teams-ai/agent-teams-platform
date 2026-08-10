import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import { Lang, parse } from "@ast-grep/napi";
import { loadMarkdown, readText } from "./platform-domain-documents.mjs";
import {
  validateScaffoldEvidence,
  validateScaffoldEvidenceInventory,
} from "./platform-domain-scaffold-evidence.mjs";

const acceptedDecisionsPath = "architecture/decisions/accepted-decisions.json";
const contextPackagesRoot = "packages/contexts";

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
  try {
    const value = await lstat(path.join(repositoryRoot, relativePath));
    if (value.isDirectory()) {
      return "directory";
    }
    if (value.isFile()) {
      return "file";
    }
    return "other";
  } catch (error) {
    if (error.code === "ENOENT") {
      return "absent";
    }
    throw error;
  }
}

async function actualContextPackages(repositoryRoot, errors) {
  const rootKind = await pathKind(repositoryRoot, contextPackagesRoot);
  if (rootKind === "absent") {
    return [];
  }
  if (rootKind !== "directory") {
    errors.push(
      `DOMAIN-MATERIALIZE-006 invalid context package root: ${contextPackagesRoot}`,
    );
    return [];
  }
  let entries;
  try {
    entries = await readdir(path.join(repositoryRoot, contextPackagesRoot), {
      withFileTypes: true,
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const packages = [];
  for (const entry of entries) {
    const relativePath = `${contextPackagesRoot}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      errors.push(`DOMAIN-MATERIALIZE-003 symlink package: ${relativePath}`);
      continue;
    }
    if (!entry.isDirectory()) {
      errors.push(`DOMAIN-MATERIALIZE-004 non-directory package: ${relativePath}`);
      continue;
    }
    packages.push(relativePath);
  }
  return packages.toSorted();
}

function ownerDecisionId(dossier, errors) {
  const decisionId = dossier.metadata.owner_decision;
  if (!/^ADR-\d{4}$/u.test(decisionId ?? "")) {
    errors.push(`DOMAIN-DECISION-001 ${dossier.path} lacks owner_decision`);
    return null;
  }
  return decisionId;
}

function acceptedBaselineEntry(baseline, decisionId, errors) {
  const decisions = Array.isArray(baseline?.decisions) ? baseline.decisions : [];
  const baselineEntry = decisions.find((item) => item.id === decisionId);
  if (baselineEntry === undefined) {
    errors.push(`DOMAIN-DECISION-002 ${decisionId} is not in accepted baseline`);
    return null;
  }
  return baselineEntry;
}

async function loadAcceptedDecision(
  repositoryRoot,
  baselineEntry,
  decisionId,
  errors,
) {
  if (
    !/^docs\/decisions\/\d{4}[a-z0-9-]*\.md$/u.test(baselineEntry.path) ||
    (await pathKind(repositoryRoot, baselineEntry.path)) !== "file"
  ) {
    errors.push(`DOMAIN-DECISION-005 invalid decision path: ${baselineEntry.path}`);
    return null;
  }
  const decision = await loadMarkdown(repositoryRoot, baselineEntry.path, errors);
  return decision;
}

function validateDecisionTarget(decision, decisionId, dossier, target, errors) {
  const acceptedTargets = decision?.metadata?.accepts_package_targets;
  if (
    decision?.metadata?.id !== decisionId ||
    decision?.metadata?.status !== "accepted" ||
    decision?.metadata?.approved_by !== "product-owner" ||
    !Array.isArray(acceptedTargets) ||
    !acceptedTargets.includes(target.id)
  ) {
    errors.push(
      `DOMAIN-DECISION-003 ${decisionId} does not accept ${target.id}`,
    );
  }
  if (!(dossier.metadata.related ?? []).includes(decisionId)) {
    errors.push(`DOMAIN-DECISION-004 ${dossier.path} must relate ${decisionId}`);
  }
}

async function validateOwnerDecision(repositoryRoot, dossier, target, baseline, errors) {
  if (dossier?.metadata?.status !== "accepted") {
    return;
  }
  const decisionId = ownerDecisionId(dossier, errors);
  if (decisionId === null) {
    return;
  }
  const baselineEntry = acceptedBaselineEntry(baseline, decisionId, errors);
  if (baselineEntry === null) {
    return;
  }
  const decision = await loadAcceptedDecision(
    repositoryRoot,
    baselineEntry,
    decisionId,
    errors,
  );
  if (decision !== null) {
    validateDecisionTarget(decision, decisionId, dossier, target, errors);
  }
}

async function validateRegularFile(repositoryRoot, relativePath, errors) {
  if ((await pathKind(repositoryRoot, relativePath)) !== "file") {
    errors.push(`DOMAIN-PACKAGE-001 required regular file: ${relativePath}`);
    return false;
  }
  return true;
}

async function validatePackageManifest(repositoryRoot, target, errors) {
  const relativePath = `${target.path}/package.json`;
  const manifest = await readJson(repositoryRoot, relativePath, errors);
  if (manifest === null) {
    return;
  }
  const expectedArchitecture = {
    role: target.role,
    ownerDocument: target.owner_document,
  };
  const expectedExports = {
    ".": {
      types: "./dist/index.d.ts",
      import: "./dist/index.js",
    },
    "./composition": {
      types: "./dist/composition.d.ts",
      import: "./dist/composition.js",
    },
    "./worker": {
      types: "./dist/worker.d.ts",
      import: "./dist/worker.js",
    },
    ...(target.id === "context.project-management"
      ? {
          "./testing/model-conformance": {
            types:
              "./dist/features/managed-project-scope-admission/__tests__/model-conformance-fixture.d.ts",
            import:
              "./dist/features/managed-project-scope-admission/__tests__/model-conformance-fixture.js",
          },
        }
      : {}),
  };
  if (
    manifest.name !== target.package_name ||
    manifest.private !== true ||
    manifest.type !== "module" ||
    manifest.scripts?.test !==
      "node --test --test-concurrency=1 'dist/**/*.test.js'" ||
    manifest.scripts?.check !==
      "pnpm run clean && pnpm run typecheck && pnpm run build && pnpm run test" ||
    !isDeepStrictEqual(manifest.agentTeamsArchitecture, expectedArchitecture) ||
    !isDeepStrictEqual(manifest.exports, expectedExports)
  ) {
    errors.push(`DOMAIN-PACKAGE-002 invalid package envelope: ${relativePath}`);
  }
}

export async function validatePlatformPackageManifest(repositoryRoot, target) {
  const errors = [];
  await validatePackageManifest(repositoryRoot, target, errors);
  return errors;
}

function moduleSpecifier(statement) {
  const stringNode = statement.children().find((child) => child.kind() === "string");
  return stringNode?.children().find((child) => child.kind() === "string_fragment")
    ?.text() ?? null;
}

function exportedModuleSpecifiers(source) {
  const root = parse(Lang.TypeScript, source).root();
  const statements = root.children();
  if (statements.some((statement) => statement.kind() !== "export_statement")) {
    return null;
  }
  const specifiers = statements.map(moduleSpecifier);
  return specifiers.every((specifier) => specifier !== null) ? specifiers : null;
}

async function validatePackageSurfaces(
  repositoryRoot,
  target,
  firstFeature,
  errors,
) {
  const surfaces = new Map([
    ["index.ts", "public"],
    ["composition.ts", "composition"],
    ["worker.ts", "worker"],
  ]);
  for (const [file, surface] of surfaces) {
    const relativePath = `${target.path}/src/${file}`;
    const source = await readText(repositoryRoot, relativePath, errors);
    const specifiers = source === null ? null : exportedModuleSpecifiers(source);
    const expectedFirst = `./features/${firstFeature}/${surface}.js`;
    if (
      specifiers === null ||
      !specifiers.includes(expectedFirst) ||
      specifiers.some(
        (specifier) =>
          !new RegExp(`^\\./features/[a-z0-9][a-z0-9-]*/${surface}\\.js$`, "u")
            .test(specifier),
      )
    ) {
      errors.push(`DOMAIN-PACKAGE-007 invalid package surface: ${relativePath}`);
    }
  }
}

async function validateFeaturePublicSurface(
  repositoryRoot,
  featureRoot,
  expectedExports,
  errors,
) {
  const relativePath = `${featureRoot}/public.ts`;
  const source = await readText(repositoryRoot, relativePath, errors);
  if (source === null) {
    return;
  }
  const root = parse(Lang.TypeScript, source).root();
  const forbidden = [];
  const actualExports = [];
  let hasDirectExportDeclaration = false;
  const pending = [...root.children()];
  while (pending.length > 0) {
    const node = pending.pop();
    if (["export_statement", "import_statement"].includes(node.kind())) {
      const specifier = moduleSpecifier(node);
      if (
        node.kind() === "export_statement" &&
        !node.children().some((child) => child.kind() === "export_clause")
      ) {
        hasDirectExportDeclaration = true;
      }
      if (
        specifier !== null &&
        /(?:^|\/)(?:adapters|ports)(?:\/|$)|\/(?:composition|worker)(?:\.js)?$/u
          .test(specifier)
      ) {
        forbidden.push(specifier);
      }
    }
    if (node.kind() === "export_specifier") {
      actualExports.push(node.text());
    }
    pending.push(...node.children());
  }
  if (forbidden.length > 0) {
    errors.push(
      `DOMAIN-PACKAGE-008 public feature surface exports internals: ${relativePath}`,
    );
  }
  if (
    !Array.isArray(expectedExports) ||
    hasDirectExportDeclaration ||
    expectedExports.length === 0 ||
    new Set(expectedExports).size !== expectedExports.length ||
    !isDeepStrictEqual(actualExports.toSorted(), expectedExports.toSorted())
  ) {
    errors.push(
      `DOMAIN-PACKAGE-009 public export contract mismatch: ${relativePath}`,
    );
  }
}

async function regularPackageFiles(repositoryRoot, relativeRoot, errors) {
  const files = [];
  const pending = [relativeRoot];
  while (pending.length > 0) {
    const current = pending.pop();
    const entries = await readdir(path.join(repositoryRoot, current), {
      withFileTypes: true,
    });
    for (const entry of entries) {
      const relativePath = `${current}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        errors.push(`DOMAIN-PACKAGE-003 symlink in package: ${relativePath}`);
      } else if (entry.isDirectory()) {
        pending.push(relativePath);
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  }
  return files;
}

async function hasNonEmptyFile(repositoryRoot, files, predicate, errors) {
  for (const file of files.filter(predicate)) {
    const source = await readText(repositoryRoot, file, errors);
    if (source?.trim()) {
      return true;
    }
  }
  return false;
}

function hasTestRegistration(source, file) {
  const language = file.endsWith(".tsx") ? Lang.Tsx : Lang.TypeScript;
  const pending = [parse(language, source).root()];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node.kind() === "call_expression") {
      const callee = node.children()[0]?.text() ?? "";
      if (/^(?:it|test)(?:\.|$)/u.test(callee)) {
        return true;
      }
    }
    pending.push(...node.children());
  }
  return false;
}

async function hasExecutableTest(repositoryRoot, files, errors) {
  const tests = files.filter((file) =>
    /\.(?:test|spec)\.(?:[cm]?ts|tsx)$/u.test(file),
  );
  for (const file of tests) {
    const source = await readText(repositoryRoot, file, errors);
    if (source?.trim() && hasTestRegistration(source, file)) {
      return true;
    }
  }
  return false;
}

async function validateFirstFeature(
  repositoryRoot,
  target,
  dossier,
  packageFiles,
  errors,
) {
  const firstFeature = dossier.metadata?.first_feature;
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(firstFeature ?? "")) {
    errors.push(`DOMAIN-PACKAGE-004 ${dossier.path} lacks first_feature`);
    return;
  }
  const featureRoot = `${target.path}/src/features/${firstFeature}`;
  if ((await pathKind(repositoryRoot, featureRoot)) !== "directory") {
    errors.push(`DOMAIN-PACKAGE-005 missing first feature: ${featureRoot}`);
    return;
  }
  const files = packageFiles.filter((file) => file.startsWith(`${featureRoot}/`));
  const hasSource = await hasNonEmptyFile(
    repositoryRoot,
    files,
    (file) => /\.(?:[cm]?ts|tsx)$/u.test(file) && !/\.(?:test|spec)\./u.test(file),
    errors,
  );
  const hasTest = await hasExecutableTest(repositoryRoot, files, errors);
  if (!hasSource || !hasTest) {
    errors.push(
      `DOMAIN-PACKAGE-006 ${featureRoot} requires implementation and test`,
    );
  }
  await validateFeaturePublicSurface(
    repositoryRoot,
    featureRoot,
    dossier.metadata.first_feature_public_exports,
    errors,
  );
}

async function validateAcceptedPackage(repositoryRoot, target, dossier, errors) {
  const packageFiles = await regularPackageFiles(
    repositoryRoot,
    target.path,
    errors,
  );
  for (const relativePath of [
    `${target.path}/package.json`,
    `${target.path}/tsconfig.json`,
    `${target.path}/src/index.ts`,
    `${target.path}/src/composition.ts`,
    `${target.path}/src/worker.ts`,
  ]) {
    await validateRegularFile(repositoryRoot, relativePath, errors);
  }
  await validatePackageManifest(repositoryRoot, target, errors);
  await validatePackageSurfaces(
    repositoryRoot,
    target,
    dossier.metadata.first_feature,
    errors,
  );
  await validateFirstFeature(
    repositoryRoot,
    target,
    dossier,
    packageFiles,
    errors,
  );
  await validateScaffoldEvidence(repositoryRoot, target, errors);
}

export async function validateMaterialization(
  repositoryRoot,
  catalog,
  dossiers,
  errors,
) {
  const baseline = await readJson(repositoryRoot, acceptedDecisionsPath, errors);
  const targets = Array.isArray(catalog?.packages) ? catalog.packages : [];
  const dossiersById = new Map(
    dossiers.map((dossier) => [dossier.metadata?.id, dossier]),
  );
  const actualPackages = await actualContextPackages(repositoryRoot, errors);
  await validateScaffoldEvidenceInventory(
    repositoryRoot,
    targets,
    dossiersById,
    errors,
  );
  for (const actualPath of actualPackages) {
    if (!targets.some((target) => target.path === actualPath)) {
      errors.push(`DOMAIN-MATERIALIZE-005 uncatalogued package: ${actualPath}`);
    }
  }
  for (const target of targets) {
    const dossier = dossiersById.get(target.owner_document);
    const state = await pathKind(repositoryRoot, target.path);
    const accepted = dossier?.metadata?.status === "accepted";
    await validateOwnerDecision(repositoryRoot, dossier, target, baseline, errors);
    if (!accepted && state !== "absent") {
      errors.push(`DOMAIN-MATERIALIZE-001 ${target.path} owner is not accepted`);
    } else if (accepted && state !== "directory") {
      errors.push(`DOMAIN-MATERIALIZE-002 ${target.path} must land with acceptance`);
    } else if (accepted) {
      await validateAcceptedPackage(repositoryRoot, target, dossier, errors);
    }
  }
}
