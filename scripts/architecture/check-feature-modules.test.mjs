import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const checker = fileURLToPath(new URL("./check-feature-modules.mjs", import.meta.url));
const root = "packages/example";
const slice = `${root}/src/features/admission`;

async function fixture(t) {
  const cwd = await mkdtemp(join(tmpdir(), "platform-feature-module-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  async function put(path, body = "export {};\n") {
    await mkdir(dirname(join(cwd, path)), { recursive: true });
    await writeFile(join(cwd, path), body);
  }
  const module = {
    id: "example", role: "platform", packageName: "@example/module", root,
    sourceRoot: `${root}/src`, preferredFeatureRoot: `${root}/src/features`,
    publicEntrypoints: [`${root}/src/index.ts`], moduleAssembly: [`${root}/src/composition.ts`],
    features: [{ id: "admission", testRoots: [`${root}/tests`],
      layers: [{ role: "domain", roots: [`${slice}/domain`] }] }],
  };
  const standardPath = "docs/architecture/feature-module-standard-v1.md";
  const liveProfile = JSON.parse(await readFile(new URL("../../architecture/foundation/feature-modules.json", import.meta.url), "utf8"));
  const profile = { schemaVersion: 1, productionRoots: [root], modules: [module],
    standard: liveProfile.standard, topology: { sourcePolicy: "policy.json" } };
  await put(standardPath, await readFile(new URL(`../../${standardPath}`, import.meta.url)));
  await put("policy.json", JSON.stringify({ packageRoots: [root] }));
  await put(`${root}/package.json`, JSON.stringify({ name: module.packageName }));
  for (const path of [...module.publicEntrypoints, ...module.moduleAssembly,
    `${slice}/domain/model.ts`, `${slice}/public.ts`, `${slice}/worker.ts`, `${root}/tests/model.test.ts`]) {await put(path);}
  async function run() {
    await put("architecture/foundation/feature-modules.json", JSON.stringify(profile));
    return spawnSync(process.execPath, [checker], { cwd, encoding: "utf8" });
  }
  return { cwd, put, profile, module, run };
}

test("allows feature-owned behavior, public surfaces and exact assembly files", async (t) => {
  const { run } = await fixture(t);
  const result = await run();
  assert.equal(result.status, 0, result.stderr);
});

for (const path of ["service.ts", "domain/model.ts", "shared/helper.ts",
  "features/unregistered/domain/model.ts", "features/admission-extra/model.ts", "composition.ts/nested.ts"]) {
  test(`rejects unowned source: ${path}`, async (t) => {
    const { cwd, put, run } = await fixture(t);
    if (path.startsWith("composition.ts/")) {await rm(join(cwd, root, "src/composition.ts"));}
    await put(`${root}/src/${path}`);
    const result = await run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Source outside declared feature|Module surface must be a file/);
  });
}

for (const [name, mutate, message] of [
  ["README-only layer", async ({ cwd, put }) => {
    await rm(join(cwd, slice, "domain/model.ts"));
    await put(`${slice}/domain/README.md`, "Documentation only");
  }, /Layer has no source artifacts/],
  ["duplicate feature", async ({ module }) => { module.features.push(module.features[0]); }, /duplicate feature/],
  ["overlapping feature roots", async ({ module }) => {
    module.features.push({
      id: "admission/nested",
      testRoots: [`${root}/tests`],
      layers: [{ role: "domain", roots: [`${slice}/nested/domain`] }],
    });
  }, /Overlapping feature roots/],
  ["duplicate layer", async ({ module }) => { module.features[0].layers.push(module.features[0].layers[0]); }, /Duplicate layer role/],
  ["unknown topology root", async ({ put }) => { await put("policy.json", JSON.stringify({ packageRoots: [root, "packages/unknown"] })); }, /package topology/],
  ["changed standard bytes", async ({ put }) => { await put("docs/architecture/feature-module-standard-v1.md", "changed"); }, /digest mismatch/],
  ["standard digest drift", async ({ profile }) => { profile.standard.digest = "sha256:incorrect"; }, /digest mismatch/],
  ["unknown module role", async ({ module }) => { module.role = "other"; }, /Invalid or duplicate module/],
  ["unreviewed exception", async ({ module }) => { module.exceptions = [{ root: "shared" }]; }, /Unreviewed ownership/],
  ["removed module classification", async ({ profile }) => { profile.modules = []; }, /classify every production module/],
  ["missing source tree", async ({ cwd }) => rm(join(cwd, root, "src"), { recursive: true }), /ENOENT/],
  ["empty layer", async ({ cwd }) => rm(join(cwd, slice, "domain/model.ts")), /Empty declared source directory/],
  ["missing test root", async ({ cwd }) => rm(join(cwd, root, "tests"), { recursive: true }), /ENOENT/],
  ["duplicate module", async ({ profile, module }) => profile.modules.push(module), /package topology|duplicate module/],
  ["empty layer declaration", async ({ module }) => { module.features[0].layers = [{}]; }, /Incomplete layer/],
  ["layer outside its feature", async ({ module }) => { module.features[0].layers[0].roots = [`${root}/src`]; }, /Invalid owned path/],
  ["path traversal", async ({ module }) => { module.sourceRoot = `${root}/src/../src`; }, /Invalid owned path/],
  ["wrong package identity", async ({ module }) => { module.packageName = "@other/module"; }, /Package identity mismatch/],
  ["unclassified production root", async ({ profile }) => profile.productionRoots.push("packages/other"), /Unclassified production root/],
]) {
  test(`rejects ${name}`, async (t) => {
    const state = await fixture(t);
    await mutate(state);
    const result = await state.run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, message);
  });
}

test("allows the testing role's fixture and script mapping", async (t) => {
  const state = await fixture(t);
  state.module.role = "testing";
  state.module.sourceRoot = `${root}/fixtures`;
  state.module.preferredFeatureRoot = `${root}/scripts`;
  state.module.publicEntrypoints = [`${root}/scripts/model.mjs`];
  state.module.moduleAssembly = [];
  state.module.features[0].layers = [{ role: "testing", roots: [`${root}/fixtures`] }];
  await state.put(`${root}/fixtures/data.json`, "{}");
  await state.put(`${root}/scripts/model.mjs`);
  const result = await state.run();
  assert.equal(result.status, 0, result.stderr);
});
