import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const root = await mkdtemp(path.join(tmpdir(), "platform-clean-spec-gates-"));
const archive = path.join(root, "repository.tar");

try {
  await execute("git", ["archive", "--format=tar", `--output=${archive}`, "HEAD"]);
  for (const gate of [
    "spec:property",
    "spec:mutation",
    "spec:model",
    "spec:production-conformance",
  ]) {
    const checkout = path.join(root, gate.replace(":", "-"));
    await execute("mkdir", [checkout]);
    await execute("tar", ["-xf", archive, "-C", checkout]);
    await execute(
      "pnpm",
      ["install", "--offline", "--frozen-lockfile", "--ignore-scripts"],
      { cwd: checkout },
    );
    await execute("pnpm", [gate], { cwd: checkout });
  }
  console.log("Clean-checkout executable specification gates passed.");
} finally {
  await rm(root, { recursive: true, force: true });
}
