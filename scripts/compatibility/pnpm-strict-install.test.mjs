import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const pinnedPnpm = "pnpm@11.18.0";

function runPnpm(cli, fixture, ...args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: fixture,
    encoding: "utf8",
    env: { ...process.env, CI: "true" },
  });
  if (result.error) {
    throw result.error;
  }
  return result;
}

async function fixtureFile(fixture, file, content) {
  const target = path.join(fixture, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}

async function resolvedPnpmCli() {
  const executableDirectories = [
    ...(process.env.npm_execpath ? [path.dirname(process.env.npm_execpath)] : []),
    ...(process.env.PATH ?? "").split(path.delimiter),
  ];
  const candidates = [
    process.env.npm_execpath,
    ...executableDirectories.flatMap((directory) => [
      path.join(directory, "pnpm"),
      path.join(directory, "pnpm.cjs"),
      path.join(directory, "pnpm.mjs"),
      path.join(directory, "pnpm.js"),
      path.resolve(directory, "..", "pnpm", "bin", "pnpm.mjs"),
    ]),
  ];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    try {
      const resolved = await realpath(candidate);
      if (/\.(?:mjs|cjs|js)$/u.test(resolved)) {
        return resolved;
      }
    } catch { /* candidate is absent from this PATH entry */ }
  }
  throw new Error("Pinned pnpm JavaScript CLI is unavailable");
}

test("pinned pnpm rejects fresh peer and engine conflicts and audits frozen peers", async () => {
  const manifest = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  assert.equal(manifest.packageManager, pinnedPnpm);
  const cli = await resolvedPnpmCli();
  const version = runPnpm(cli, fileURLToPath(root), "--version");
  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout.trim(), pinnedPnpm.slice("pnpm@".length));

  const fixture = await mkdtemp(path.join(tmpdir(), "platform-pnpm-strict-"));
  try {
    await fixtureFile(fixture, "pnpm-workspace.yaml", "packages: []\nengineStrict: true\nstrictPeerDependencies: true\nautoInstallPeers: false\n");
    await fixtureFile(fixture, "package.json", JSON.stringify({
      name: "strict-fixture", private: true, packageManager: pinnedPnpm,
      dependencies: { "fixture-host": "file:packages/host", "fixture-consumer": "file:packages/consumer" },
    }));
    await fixtureFile(fixture, "packages/host/package.json", JSON.stringify({
      name: "fixture-host", version: "1.0.0",
    }));
    await fixtureFile(fixture, "packages/consumer/package.json", JSON.stringify({
      name: "fixture-consumer", version: "1.0.0",
      peerDependencies: { "fixture-host": ">=2.0.0" },
    }));

    const fresh = runPnpm(cli, fixture, "install", "--offline", "--ignore-scripts", "--strict-peer-dependencies");
    assert.notEqual(fresh.status, 0, `fresh install accepted incompatible peer:\n${fresh.stdout}\n${fresh.stderr}`);
    assert.match(fresh.stdout + fresh.stderr, /ERR_PNPM_PEER_DEP_ISSUES/u);

    await fixtureFile(fixture, "pnpm-workspace.yaml", "packages: []\nengineStrict: true\nstrictPeerDependencies: false\nautoInstallPeers: false\n");
    const permissive = runPnpm(cli, fixture, "install", "--offline", "--ignore-scripts");
    assert.equal(permissive.status, 0, permissive.stdout + permissive.stderr);
    const lockPath = path.join(fixture, "pnpm-lock.yaml");
    const lock = await readFile(lockPath, "utf8");
    const withHostVersion = lock.replace(
      "fixture-host@file:packages/host:\n    resolution:",
      "fixture-host@file:packages/host:\n    version: 1.0.0\n    resolution:",
    );
    assert.notEqual(withHostVersion, lock, "fixture must record the installed host version");
    await writeFile(lockPath, withHostVersion);
    await fixtureFile(fixture, "pnpm-workspace.yaml", "packages: []\nengineStrict: true\nstrictPeerDependencies: true\nautoInstallPeers: false\n");

    const frozen = runPnpm(cli, fixture, "install", "--offline", "--frozen-lockfile", "--ignore-scripts", "--strict-peer-dependencies");
    assert.equal(frozen.status, 0, frozen.stdout + frozen.stderr);
    const lockedPeers = runPnpm(cli, fixture, "peers", "check", "--lockfile-only");
    assert.notEqual(lockedPeers.status, 0, `locked peer conflict escaped audit:\n${lockedPeers.stdout}\n${lockedPeers.stderr}`);
    assert.match(lockedPeers.stdout + lockedPeers.stderr, /fixture-consumer|fixture-host/u);

    await fixtureFile(fixture, "package.json", JSON.stringify({
      name: "strict-fixture", private: true, packageManager: pinnedPnpm,
      engines: { node: ">=99" },
    }));
    const engine = runPnpm(cli, fixture, "install", "--offline", "--lockfile-only", "--ignore-scripts", "--engine-strict");
    assert.notEqual(engine.status, 0, `fresh install accepted incompatible Node engine:\n${engine.stdout}\n${engine.stderr}`);
    assert.match(engine.stdout + engine.stderr, /UNSUPPORTED_ENGINE|Unsupported environment/u);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
