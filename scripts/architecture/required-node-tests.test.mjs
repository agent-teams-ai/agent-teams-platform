import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const manifestPath = fileURLToPath(import.meta.resolve("@agent-teams/engineering-foundation/package.json"));
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const cli = join(dirname(manifestPath), manifest.bin["agent-teams-node-test"]);
const identity = { file: "critical.test.mjs", names: ["Windows path semantics"], kind: "test" };

async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), "platform-required-node-"));
  try {
    await writeFile(join(directory, "contract.json"), JSON.stringify({ schemaVersion: 1, required: [identity], exceptions: [] }));
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
function execute(directory) {
  const result = spawnSync(process.execPath, [cli, "--contract", "contract.json", "--", identity.file],
    { cwd: directory, encoding: "utf8", timeout: 60_000 });
  assert.equal(result.error, undefined);
  return result;
}

test("installed mandatory runner accepts completion and rejects omitted or skipped identities", async () => {
  await fixture(async (directory) => {
    const entry = join(directory, identity.file);
    await writeFile(entry, 'import test from "node:test"; import { writeFile } from "node:fs/promises"; test("Windows path semantics", async () => { await writeFile("completed", "done"); });\n');
    const completed = execute(directory);
    assert.equal(completed.status, 0, completed.stderr + completed.stdout);
    assert.equal(await readFile(join(directory, "completed"), "utf8"), "done");
    await writeFile(entry, 'import test from "node:test"; test("ordinary test", () => {});\n');
    const omission = execute(directory);
    assert.notEqual(omission.status, 0);
    assert.match(omission.stderr, /omitted/u);
    await writeFile(entry, 'import test from "node:test"; test("Windows path semantics", { skip: true }, () => {});\n');
    const skipped = execute(directory);
    assert.notEqual(skipped.status, 0);
    assert.match(skipped.stderr, /skipped/u);
  });
});

test("installed mandatory runner admits only an exact justified OS exception", async () => {
  await fixture(async (directory) => {
    // This fixture's assertion applies specifically to Windows path parsing.
    await writeFile(join(directory, identity.file), 'import assert from "node:assert/strict"; import path from "node:path"; import test from "node:test"; test("Windows path semantics", { skip: process.platform !== "win32" }, () => { assert.equal(path.parse("C:/work").root, "C:/"); });\n');
    const exception = { ...identity, status: "skipped", reason: "Native drive-letter paths apply only to Windows; POSIX execution cannot qualify them.", applicability: { platforms: ["linux", "darwin"] } };
    const contract = { schemaVersion: 1, required: [identity], exceptions: [exception] };
    await writeFile(join(directory, "contract.json"), JSON.stringify(contract));
    assert.equal(execute(directory).status, 0);
    // A universal exception is rejected even on Windows, where the test passes.
    exception.applicability.platforms = ["linux", "darwin", "win32"];
    await writeFile(join(directory, "contract.json"), JSON.stringify(contract));
    const blanket = execute(directory);
    assert.notEqual(blanket.status, 0);
    assert.match(blanket.stderr, /platform subset/u);
    if (process.platform !== "win32") {
      exception.applicability.platforms = ["win32"];
      await writeFile(join(directory, "contract.json"), JSON.stringify(contract));
      assert.notEqual(execute(directory).status, 0);
      exception.applicability.platforms = [process.platform];
      exception.status = "omitted";
      await writeFile(join(directory, "contract.json"), JSON.stringify(contract));
      assert.notEqual(execute(directory).status, 0);
    }
  });
});

test("consumer gate rejects dropping a whole mandatory entry file", async () => {
  await fixture(async (directory) => {
    const consumer = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    const contractPath = "architecture/foundation/required-node-tests.json";
    const { mkdir, cp } = await import("node:fs/promises");
    await mkdir(join(directory, dirname(contractPath)), { recursive: true });
    await cp(join(root, contractPath), join(directory, contractPath));
    const gate = join(root, "scripts/architecture/check-required-node-tests.mjs");
    await writeFile(join(directory, "package.json"), JSON.stringify(consumer));
    const run = () => spawnSync(process.execPath, [gate], { cwd: directory, encoding: "utf8" });
    assert.equal(run().status, 0);
    const contractBytes = await readFile(join(directory, contractPath));
    const contract = JSON.parse(contractBytes.toString("utf8"));
    const entryFiles = [...new Set(contract.required.map(({ file }) => file))].toSorted();
    const criticalIndex = contract.required.findIndex(({ names }) =>
      names.includes("installed quality gate rejects an unadmitted unknown assertion"));
    assert.notEqual(criticalIndex, -1);
    contract.required.splice(criticalIndex, 1);
    assert.deepEqual([...new Set(contract.required.map(({ file }) => file))].toSorted(), entryFiles);
    await writeFile(join(directory, contractPath), JSON.stringify(contract));
    const identityOmission = run();
    assert.equal(identityOmission.status, 1);
    assert.match(identityOmission.stderr,
      /^AssertionError \[ERR_ASSERTION\]: Mandatory Node identity contract must match the reviewed consumer scope\.$/mu);
    await writeFile(join(directory, contractPath), contractBytes);
    assert.equal(run().status, 0);
    consumer.scripts["architecture:test:required"] = consumer.scripts["architecture:test:required"].replace(" scripts/architecture/source-dependencies-v3.test.mjs", "");
    await writeFile(join(directory, "package.json"), JSON.stringify(consumer));
    const omission = run();
    assert.notEqual(omission.status, 0);
    assert.match(omission.stderr, /entry file selection/u);
  });
});
