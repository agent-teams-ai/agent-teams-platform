import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { Lang, parse } from "@ast-grep/napi";

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
const ignoredGeneratedDirectories = new Set([
  ".cache",
  ".nx",
  "coverage",
  "dist",
  "node_modules",
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

function sourceLanguage(filePath) {
  if ([".jsx", ".tsx"].includes(path.extname(filePath))) {
    return Lang.Tsx;
  }
  if ([".cjs", ".js", ".jsx", ".mjs"].includes(path.extname(filePath))) {
    return Lang.JavaScript;
  }
  return Lang.TypeScript;
}

function validateSourceNode(filePath, node, policy, errors) {
  if (
    !policy.allowProfileVocabulary &&
    node.kind() === "identifier" &&
    policy.forbiddenIdentifiers.has(node.text())
  ) {
    errors.push(
      `DEPLOY-CORE-001 ${filePath}:${node.range().start.line + 1} profile identifier ${node.text()} is forbidden in domain/application`,
    );
  }
  if (
    !policy.allowProfileVocabulary &&
    node.kind() === "string_fragment" &&
    policy.forbiddenLiterals.has(node.text())
  ) {
    errors.push(
      `DEPLOY-CORE-002 ${filePath}:${node.range().start.line + 1} profile literal ${node.text()} is forbidden in domain/application`,
    );
  }
  if (node.kind() === "identifier" && forbiddenBareLifecycleIdentifiers.has(node.text())) {
    errors.push(
      `DEPLOY-CORE-004 ${filePath}:${node.range().start.line + 1} ambiguous bare lifecycle identifier ${node.text()} is forbidden`,
    );
  }
  if (node.kind() === "string_fragment" && node.text().toLowerCase() === "provisioning") {
    errors.push(
      `DEPLOY-CORE-005 ${filePath}:${node.range().start.line + 1} ambiguous bare lifecycle literal ${node.text()} is forbidden`,
    );
  }
  if (
    node.kind() === "string_fragment" &&
    forbiddenCoreReferencePatterns.some((pattern) => pattern.test(node.text()))
  ) {
    errors.push(
      `DEPLOY-CORE-003 ${filePath}:${node.range().start.line + 1} adapter/composition/cloud/provider reference ${node.text()} is forbidden`,
    );
  }
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
  const root = parse(sourceLanguage(filePath), source).root();
  const policy = { allowProfileVocabulary, forbiddenIdentifiers, forbiddenLiterals };
  function visit(node) {
    validateSourceNode(filePath, node, policy, errors);
    for (const child of node.children()) {
      visit(child);
    }
  }
  visit(root);
  return errors;
}

export async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  });
  const paths = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (ignoredGeneratedDirectories.has(entry.name)) {
        continue;
      }
      paths.push(...(await walk(entryPath)));
    } else {
      paths.push(entryPath);
    }
  }
  return paths;
}

export async function validateCoreProfileIndependence(repositoryRoot, catalog) {
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
        (ownerPath) => relativePath === ownerPath || relativePath.startsWith(`${ownerPath}/`),
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
