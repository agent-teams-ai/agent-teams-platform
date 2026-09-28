import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import YAML from "yaml";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const requireNode26Strict = process.argv.includes("--require-node26-strict");
const sourceRoots = ["packages", "scripts", "tooling"];
// These roots and the files below cover the checked-in inputs to the required
// Platform gates, including their workflow definitions and documentation authority.
const digestRoots = [...sourceRoots, "architecture", "docs", ".github", ".agents"];
const digestFiles = [
  ".gitattributes",
  ".gitignore",
  ".markdownlint-cli2.mjs",
  ".node-version",
  ".npmrc",
  ".oxlintrc.json",
  ".oxlintrc.type-aware.json",
  "foundation.config.yaml",
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  "README.md",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.json",
];
const ignoredDirectories = new Set(["node_modules", "dist", ".cache"]);

function fail(message) {
  throw new Error(message);
}

function normalizeVersion(version) {
  const parts = version.split(".").map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function compareVersions(left, right) {
  const leftParts = normalizeVersion(left);
  const rightParts = normalizeVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }
  return 0;
}

function satisfiesComparator(version, comparator) {
  const match = /^(>=|>|<=|<|=)?(\d+(?:\.\d+){0,2})$/.exec(comparator.trim());
  if (!match) {
    fail(`Unsupported engine comparator: ${comparator}`);
  }
  const comparison = compareVersions(version, match[2]);
  switch (match[1] ?? "=") {
    case ">=":
      return comparison >= 0;
    case ">":
      return comparison > 0;
    case "<=":
      return comparison <= 0;
    case "<":
      return comparison < 0;
    default:
      return comparison === 0;
  }
}

function satisfiesRange(version, range) {
  return range
    .split("||")
    .some((alternative) => alternative
      .trim()
      .split(/\s+/u)
      .every((comparator) => satisfiesComparator(version, comparator)));
}

async function collectSourceFiles(directory, files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) {
      continue;
    }
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectSourceFiles(entryPath, files);
    } else if (entry.isFile() && /\.(?:m?js|cjs|ts|mts|cts)$/u.test(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

async function collectDigestFiles(directory, files = []) {
  if (!(await lstat(directory)).isDirectory()) {
    fail(`Candidate input root must be a directory: ${directory}`);
  }
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) {
      continue;
    }
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectDigestFiles(entryPath, files);
    } else if (entry.isFile()) {
      files.push(entryPath);
    } else {
      fail(`Unsupported candidate input entry: ${entryPath}`);
    }
  }
  return files;
}

export async function candidateInputDigest(root = repositoryRoot) {
  if (!(await lstat(root)).isDirectory()) {
    fail(`Candidate input root must be a directory: ${root}`);
  }
  const files = digestFiles.map((file) => path.join(root, file));
  for (const sourceRoot of digestRoots) {
    await collectDigestFiles(path.join(root, sourceRoot), files);
  }
  const hash = createHash("sha256");
  for (const file of files.toSorted()) {
    const relativePath = path.relative(root, file);
    if (!(await lstat(file)).isFile()) {
      fail(`Candidate input must be a regular file: ${relativePath}`);
    }
    const content = await readFile(file);
    hash.update(`${relativePath}\0${content.length}\0`);
    hash.update(content);
  }
  return hash.digest("hex");
}

async function collectNodeApis() {
  const files = [];
  for (const sourceRoot of sourceRoots) {
    await collectSourceFiles(path.join(repositoryRoot, sourceRoot), files);
  }
  const nodeApis = new Set();
  for (const filePath of files) {
    const source = await readFile(filePath, "utf8");
    for (const match of source.matchAll(/(?:from\s+|require\(\s*|import\(\s*)["'](node:[^"']+)["']/gu)) {
      nodeApis.add(match[1]);
    }
  }
  return [...nodeApis].toSorted();
}

function parseLockedAgentTeamsPackages(lockfile) {
  const packages = new Map();
  const packagesStart = lockfile.indexOf("\npackages:\n");
  const snapshotsStart = lockfile.indexOf("\nsnapshots:\n");
  const packageSection = lockfile.slice(packagesStart, snapshotsStart);
  const packagePattern = /^ {2}'(@agent-teams\/[^']+)':\n([\s\S]*?)(?=^ {2}[^ \n]|^snapshots:)/gmu;
  for (const match of packageSection.matchAll(packagePattern)) {
    const identity = match[1];
    const versionSeparator = identity.lastIndexOf("@");
    const name = identity.slice(0, versionSeparator);
    const version = identity.slice(versionSeparator + 1);
    const engineMatch = /engines: \{node: '([^']+)'/u.exec(match[2]);
    packages.set(`${name}@${version}`, {
      name,
      version,
      nodeEngine: engineMatch?.[1] ?? ">=0",
    });
  }
  return packages;
}

function recordedDependencyKeys(compatibility) {
  return [
    ...compatibility.upstreamDependencies.foundation,
    ...compatibility.upstreamDependencies.runtime,
  ].map((dependency) => `${dependency.name}@${dependency.version}`);
}

function validateUpstreamDependencies(compatibility, lockedPackages) {
  const dependencies = [
    ...compatibility.upstreamDependencies.foundation.map((dependency) => ({ ...dependency, owner: "foundation" })),
    ...compatibility.upstreamDependencies.runtime.map((dependency) => ({ ...dependency, owner: "runtime" })),
  ];
  const recordedKeys = new Set(recordedDependencyKeys(compatibility));
  for (const identity of lockedPackages.keys()) {
    if (!recordedKeys.has(identity)) {
      fail(`Published @agent-teams dependency is not recorded: ${identity}`);
    }
  }
  for (const dependency of dependencies) {
    const identity = `${dependency.name}@${dependency.version}`;
    const lockedDependency = lockedPackages.get(identity);
    if (!lockedDependency) {
      fail(`Recorded upstream dependency is absent from pnpm-lock.yaml: ${identity}`);
    }
    if (lockedDependency.nodeEngine !== dependency.nodeEngine) {
      fail(`Node engine drift for ${identity}: ${lockedDependency.nodeEngine} != ${dependency.nodeEngine}`);
    }
    const supported = satisfiesRange(compatibility.platform.candidateVersion, dependency.nodeEngine);
    const expectedStatus = supported ? "SUPPORTED" : "BLOCKED_BY_UPSTREAM_ENGINE";
    if (dependency.node26StrictInstall !== expectedStatus) {
      fail(
        `Node 26 strict-install status drift for ${identity}: ` +
          `${dependency.node26StrictInstall} != ${expectedStatus}`,
      );
    }
  }
  return dependencies;
}

async function validatePrivatePackages(compatibility) {
  for (const artifact of compatibility.privatePackages) {
    const manifestPath = path.join(
      repositoryRoot,
      "packages/contexts/project-management/package.json",
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (!manifest.private || manifest.name !== artifact.name || manifest.version !== artifact.version) {
      fail(`Private package identity drift: ${artifact.name}@${artifact.version}`);
    }
    const runtimeDependencies = Object.keys(manifest.dependencies ?? {}).toSorted();
    if (JSON.stringify(runtimeDependencies) !== JSON.stringify(artifact.runtimeDependencies)) {
      fail(`Private package runtime dependency drift: ${artifact.name}`);
    }
  }
}

export async function readCompatibilityState() {
  const [
    compatibility,
    schema,
    packageManifest,
    lockfile,
    nodeVersion,
    npmrc,
    workspace,
  ] = await Promise.all([
    readFile(path.join(repositoryRoot, "architecture/runtime/node-compatibility.json"), "utf8").then(JSON.parse),
    readFile(path.join(repositoryRoot, "architecture/runtime/node-compatibility.schema.json"), "utf8").then(JSON.parse),
    readFile(path.join(repositoryRoot, "package.json"), "utf8").then(JSON.parse),
    readFile(path.join(repositoryRoot, "pnpm-lock.yaml"), "utf8"),
    readFile(path.join(repositoryRoot, ".node-version"), "utf8"),
    readFile(path.join(repositoryRoot, ".npmrc"), "utf8"),
    readFile(path.join(repositoryRoot, "pnpm-workspace.yaml"), "utf8"),
  ]);
  return { compatibility, schema, packageManifest, lockfile, nodeVersion, npmrc, workspace };
}

export function validatePolicyState(state) {
  const { compatibility, schema, packageManifest, nodeVersion, npmrc, workspace } = state;
  if (schema.title !== "Platform Node runtime compatibility record") {
    fail("Node compatibility schema identity drift");
  }
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  if (!validate(compatibility)) {
    fail(`Node compatibility schema violation: ${ajv.errorsText(validate.errors)}`);
  }
  if (compatibility.qualification.targetVersion !== compatibility.platform.candidateVersion) {
    fail("Qualification target must equal the Node candidate version");
  }
  if (packageManifest.engines.node !== compatibility.platform.engine) {
    fail("Root Node engine drift");
  }
  if (nodeVersion.trim() !== compatibility.platform.productionVersion) {
    fail("Production Node default drift");
  }
  if (!satisfiesRange(compatibility.platform.productionVersion, compatibility.platform.engine)) {
    fail("Production Node default is outside the root engine");
  }
  if (!satisfiesRange(compatibility.platform.candidateVersion, compatibility.platform.engine)) {
    fail("Node 26 candidate is outside the root engine");
  }
  if (satisfiesRange(compatibility.platform.skippedVersion, compatibility.platform.engine)) {
    fail("Node 25 must remain outside the root engine");
  }
  for (const requiredSetting of [
    "engine-strict=true",
    "save-exact=true",
    "strict-peer-dependencies=true",
  ]) {
    if (!npmrc.split(/\r?\n/u).includes(requiredSetting)) {
      fail(`Strict install setting drift: ${requiredSetting}`);
    }
  }
  const workspaceDocument = YAML.parseDocument(workspace, { uniqueKeys: true });
  if (workspaceDocument.errors.length > 0) {
    fail(`Invalid pnpm workspace configuration: ${workspaceDocument.errors[0].message}`);
  }
  const workspaceSettings = workspaceDocument.toJS();
  for (const key of ["engineStrict", "strictPeerDependencies", "saveExact"]) {
    if (workspaceSettings?.[key] !== true) {
      fail(`Effective pnpm workspace setting drift: ${key}`);
    }
  }
}

export async function createCompatibilityReport(state) {
  const { compatibility, lockfile } = state;
  const lockedPackages = parseLockedAgentTeamsPackages(lockfile);
  const upstreamDependencies = validateUpstreamDependencies(compatibility, lockedPackages);
  await validatePrivatePackages(compatibility);

  const actualNodeApis = await collectNodeApis();
  if (JSON.stringify(actualNodeApis) !== JSON.stringify(compatibility.nodeApis)) {
    fail(`Node API audit drift: ${JSON.stringify(actualNodeApis)}`);
  }

  const blockers = upstreamDependencies
    .filter((dependency) => dependency.node26StrictInstall === "BLOCKED_BY_UPSTREAM_ENGINE")
    .map((dependency) => ({
      owner: dependency.owner,
      package: `${dependency.name}@${dependency.version}`,
      nodeEngine: dependency.nodeEngine,
    }));
  const expectedQualificationStatus = blockers.length === 0
    ? "IMPLEMENTED_PENDING_QUALIFICATION"
    : "PENDING_UPSTREAM_ENGINE_COMPATIBILITY";
  const expectedStrictInstallStatus = blockers.length === 0
    ? "READY_FOR_STRICT_INSTALL"
    : "BLOCKED_BY_UPSTREAM_ENGINE";
  if (compatibility.qualification.status !== expectedQualificationStatus) {
    fail(`Qualification status drift: ${compatibility.qualification.status} != ${expectedQualificationStatus}`);
  }
  if (compatibility.qualification.strictInstall !== expectedStrictInstallStatus) {
    fail(`Strict-install status drift: ${compatibility.qualification.strictInstall} != ${expectedStrictInstallStatus}`);
  }

  return {
    status: blockers.length === 0 ? "NODE26_STRICT_INSTALL_READY" : "NODE26_STRICT_INSTALL_BLOCKED",
    productionDefault: compatibility.platform.productionVersion,
    candidateVersion: compatibility.platform.candidateVersion,
    skippedVersion: compatibility.platform.skippedVersion,
    auditedNodeApis: actualNodeApis,
    upstreamDependencies: upstreamDependencies.map(({ owner, name, version, nodeEngine, node26StrictInstall }) => ({
      owner,
      package: `${name}@${version}`,
      nodeEngine,
      node26StrictInstall,
    })),
    privatePackages: compatibility.privatePackages,
    blockers,
    candidateInputDigest: await candidateInputDigest(),
    qualificationEvidence: "NOT_RECORDED",
  };
}

async function main() {
  const state = await readCompatibilityState();
  validatePolicyState(state);
  const report = await createCompatibilityReport(state);
  console.log(JSON.stringify(report, null, 2));
  if (requireNode26Strict && report.blockers.length > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
