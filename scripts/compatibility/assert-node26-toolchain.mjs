import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const repositoryRoot = new URL("../../", import.meta.url);
const compatibility = JSON.parse(
  await readFile(new URL("architecture/runtime/node-compatibility.json", repositoryRoot), "utf8"),
);
const [major, minor, patch] = process.versions.node.split(".").map(Number);
const actualVersion = `${major}.${minor}.${patch}`;

assert.equal(
  actualVersion,
  compatibility.qualification.targetVersion,
  `Node 26 qualification requires ${compatibility.qualification.targetVersion}; received ${process.versions.node}`,
);
assert.equal(process.release.name, "node");

console.log(
  JSON.stringify({
    nodeVersion: process.versions.node,
    execPath: process.execPath,
    status: "TOOLCHAIN_CONFIRMED",
  }),
);
