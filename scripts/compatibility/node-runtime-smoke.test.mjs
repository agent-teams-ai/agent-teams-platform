import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual, promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("Node runtime APIs preserve observable filesystem and process behavior", async () => {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "platform-node-compat-"));
  const fixturePath = path.join(temporaryDirectory, "fixture.json");
  const fixture = {
    platform: "agent-teams",
    operation: { id: "node-compatibility", attempts: 2 },
  };

  try {
    await writeFile(fixturePath, `${JSON.stringify(fixture)}\n`, "utf8");
    const roundTrip = JSON.parse(await readFile(fixturePath, "utf8"));
    assert.equal(isDeepStrictEqual(fixture, structuredClone(roundTrip)), true);
    assert.equal(
      createHash("sha256").update(JSON.stringify(fixture)).digest("hex").length,
      64,
    );
    assert.equal(fileURLToPath(pathToFileURL(fixturePath)), fixturePath);

    const childScript = `
      import { readFile } from "node:fs/promises";
      const value = JSON.parse(await readFile(process.argv[1], "utf8"));
      process.stdout.write(value.operation.id);
    `;
    const childResult = await execFileAsync(
      process.execPath,
      ["--input-type=module", "--eval", childScript, fixturePath],
      { encoding: "utf8" },
    );
    assert.equal(childResult.stdout, "node-compatibility");
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
