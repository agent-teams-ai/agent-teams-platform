import { execFile } from "node:child_process";
import { cp, lstat, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const root = await mkdtemp(path.join(tmpdir(), "platform-clean-spec-gates-"));
const snapshot = path.join(root, "source");

try {
  // Qualify current candidate bytes, including intended new files, before commit.
  const inventory = await execute("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" });
  for (const file of new Set(inventory.stdout.split("\0").filter(Boolean))) {
    const present = await lstat(file).catch((error) => {
      if (error.code === "ENOENT") { return null; }
      throw error;
    });
    if (present === null) { continue; }
    const destination = path.join(snapshot, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(file, destination);
  }
  // pnpm 11 writes its installed modules record as JSON under this historical filename.
  const modules = JSON.parse(await readFile("node_modules/.modules.yaml", "utf8"));
  if (typeof modules.storeDir !== "string") {
    throw new Error("Installed pnpm store identity is missing.");
  }
  const storeDirectory = path.dirname(modules.storeDir);
  for (const gate of [
    "spec:property",
    "spec:mutation",
    "spec:model",
    "spec:production-conformance",
  ]) {
    const checkout = path.join(root, gate.replace(":", "-"));
    await cp(snapshot, checkout, { recursive: true });
    await execute(
      "pnpm",
      ["install", "--offline", "--frozen-lockfile", "--ignore-scripts", "--store-dir", storeDirectory],
      { cwd: checkout },
    );
    await execute("pnpm", [gate], { cwd: checkout });
  }
  console.log("Clean-checkout executable specification gates passed.");
} finally {
  await rm(root, { recursive: true, force: true });
}
