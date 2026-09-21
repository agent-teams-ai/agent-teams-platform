import { lstat, readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parse } from "yaml";
import { posix } from "node:path";

const within = (path, root) => path === root || path.startsWith(`${root}/`);

function ownedPath(path, root) {
  if (typeof path !== "string" || path === "." || path.startsWith("/") ||
      path.includes("\\") || path.split("/").includes("..") || posix.normalize(path) !== path ||
      (root && !within(path, root))) {
    throw new Error(`Invalid owned path: ${path} (owner: ${root ?? "repository"})`);
  }
  return path;
}

async function filesAt(path) {
  const stat = await lstat(path);
  if (stat.isFile()) {return [path];}
  if (!stat.isDirectory()) {throw new Error(`Unsupported source entry: ${path}`);}
  const files = [];
  for (const name of (await readdir(path)).toSorted()) {files.push(...await filesAt(`${path}/${name}`));}
  if (!files.length) {throw new Error(`Empty declared source directory: ${path}`);}
  return files;
}

async function validateLayers(module, feature, featureRoot) {
  const layerRoles = new Set();
  const layerRoots = [];
  for (const layer of feature.layers) {
    if (!["contracts", "domain", "application", "adapters", "composition", "testing"].includes(layer.role) || !layer.roots?.length) {throw new Error(`Incomplete layer: ${module.id}/${feature.id}`);}
    if (layerRoles.has(layer.role)) {throw new Error(`Duplicate layer role: ${layer.role}`);}
    layerRoles.add(layer.role);
    for (const root of layer.roots) {
      if (layerRoots.some((other) => within(root, other) || within(other, root))) {
        throw new Error(`Overlapping layer roots: ${root}`);
      }
      layerRoots.push(root);
      const files = await filesAt(ownedPath(root, featureRoot));
      if (module.role !== "testing" && !files.some((file) => /\.[cm]?[jt]sx?$/u.test(file))) {
        throw new Error(`Layer has no source artifacts: ${root}`);
      }
    }
  }
}

const profile = JSON.parse(await readFile("architecture/foundation/feature-modules.json", "utf8"));
if (profile.schemaVersion !== 1 || !profile.modules?.length) {throw new Error("Feature profile must classify every production module.");}
const standard = await readFile(ownedPath(profile.standard.path));
if (profile.standard.id !== "agent-teams.feature-module-standard" || profile.standard.version !== "v1" ||
    profile.standard.digest !== `sha256:${createHash("sha256").update(standard).digest("hex")}`) {
  throw new Error("Feature standard identity or digest mismatch.");
}
const policy = parse(await readFile(ownedPath(profile.topology.sourcePolicy), "utf8"));
const topologyRoots = policy.packageRoots.toSorted();
if (JSON.stringify(profile.modules.map((module) => module.root).toSorted()) !== JSON.stringify(topologyRoots)) {
  throw new Error("Feature modules must match source-policy package topology.");
}
const moduleIds = new Set();
const moduleRoots = new Set();
for (const module of profile.modules) {
  if (!module.id || !["domain", "integration", "platform", "sdk", "testing"].includes(module.role) || moduleIds.has(module.id) || moduleRoots.has(module.root)) {
    throw new Error(`Invalid or duplicate module: ${module.id}`);
  }
  if (module.exceptions?.length || module.generatedRoots?.length) {
    throw new Error(`Unreviewed ownership exception or generated root: ${module.id}`);
  }
  moduleIds.add(module.id);
  moduleRoots.add(ownedPath(module.root));
  ownedPath(module.sourceRoot, module.root);
  ownedPath(module.preferredFeatureRoot, module.root);
  const manifest = JSON.parse(await readFile(`${module.root}/package.json`, "utf8"));
  if (manifest.name !== module.packageName) {throw new Error(`Package identity mismatch: ${module.id}`);}
  if (!module.features?.length) {throw new Error(`Unclassified module: ${module.id}`);}
  const sourceFiles = await filesAt(module.sourceRoot);
  const featureIds = new Set();
  const featureRoots = [];
  for (const feature of module.features) {
    if (!feature.id || featureIds.has(feature.id) || !feature.testRoots?.length || !feature.layers?.length) {
      throw new Error(`Incomplete or duplicate feature: ${module.id}/${feature.id}`);
    }
    featureIds.add(feature.id);
    // Testing modules map fixtures directly; production features own named slices.
    const featureRoot = module.role === "testing" ? module.sourceRoot :
      `${module.preferredFeatureRoot}/${feature.id}`;
    ownedPath(featureRoot, module.sourceRoot);
    if (featureRoots.some((other) => within(featureRoot, other) || within(other, featureRoot))) {
      throw new Error(`Overlapping feature roots: ${featureRoot}`);
    }
    featureRoots.push(featureRoot);
    for (const root of feature.testRoots) {await filesAt(ownedPath(root, module.root));}
    await validateLayers(module, feature, featureRoot);
  }
  const assembly = new Set();
  for (const path of [...module.moduleAssembly, ...module.publicEntrypoints]) {
    ownedPath(path, module.role === "testing" ? module.root : module.sourceRoot);
    if (!(await lstat(path)).isFile()) {throw new Error(`Module surface must be a file: ${path}`);}
    assembly.add(path);
  }
  for (const file of sourceFiles) {
    if (!assembly.has(file) && !featureRoots.some((root) => within(file, root))) {
      throw new Error(`Source outside declared feature or module assembly: ${file}`);
    }
  }
}
for (const root of profile.productionRoots) {
  if (!moduleRoots.has(root)) {throw new Error(`Unclassified production root: ${root}`);}
}
console.log(`Feature module profile passed (${profile.modules.length} modules).`);
