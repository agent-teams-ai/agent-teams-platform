import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const requireNode26Strict = process.argv.includes("--require-node26-strict");
const sourceRoots = ["packages", "scripts", "tooling"];
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
  return [...nodeApis].sort();
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

async function validatePublishedArtifacts(compatibility) {
  for (const artifact of compatibility.publishedArtifacts) {
    const manifestPath = path.join(
      repositoryRoot,
      "packages/contexts/project-management/package.json",
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (manifest.name !== artifact.name || manifest.version !== artifact.version) {
      fail(`Published artifact identity drift: ${artifact.name}@${artifact.version}`);
    }
    const runtimeDependencies = Object.keys(manifest.dependencies ?? {}).sort();
    if (JSON.stringify(runtimeDependencies) !== JSON.stringify(artifact.runtimeDependencies)) {
      fail(`Published artifact runtime dependency drift: ${artifact.name}`);
    }
  }
}

async function readCompatibilityState() {
  const [
    compatibility,
    schema,
    packageManifest,
    lockfile,
    nodeVersion,
    npmrc,
  ] = await Promise.all([
    readFile(path.join(repositoryRoot, "architecture/runtime/node-compatibility.json"), "utf8").then(JSON.parse),
    readFile(path.join(repositoryRoot, "architecture/runtime/node-compatibility.schema.json"), "utf8").then(JSON.parse),
    readFile(path.join(repositoryRoot, "package.json"), "utf8").then(JSON.parse),
    readFile(path.join(repositoryRoot, "pnpm-lock.yaml"), "utf8"),
    readFile(path.join(repositoryRoot, ".node-version"), "utf8"),
    readFile(path.join(repositoryRoot, ".npmrc"), "utf8"),
  ]);
  return { compatibility, schema, packageManifest, lockfile, nodeVersion, npmrc };
}

function validatePolicyState(state) {
  const { compatibility, schema, packageManifest, nodeVersion, npmrc } = state;
  if (schema.title !== "Platform Node runtime compatibility record") {
    fail("Node compatibility schema identity drift");
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
}

async function createCompatibilityReport(state) {
  const { compatibility, lockfile } = state;
  const lockedPackages = parseLockedAgentTeamsPackages(lockfile);
  const upstreamDependencies = validateUpstreamDependencies(compatibility, lockedPackages);
  await validatePublishedArtifacts(compatibility);

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
  const expectedQualificationStatus = blockers.length === 0 ? "QUALIFIED" : "PENDING_UPSTREAM_ENGINE_COMPATIBILITY";
  const expectedStrictInstallStatus = blockers.length === 0 ? "QUALIFIED" : "BLOCKED_BY_UPSTREAM_ENGINE";
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
    publishedArtifacts: compatibility.publishedArtifacts,
    blockers,
    sourceDigest: createHash("sha256").update(JSON.stringify(compatibility)).digest("hex"),
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

await main();
