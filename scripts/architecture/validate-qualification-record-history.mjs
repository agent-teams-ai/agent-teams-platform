import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = path.resolve(scriptDirectory, "../..");
const immutableRoots = [
  "architecture/deployment-profiles/qualification-records",
  "architecture/scaffolding/intents",
  "architecture/scaffolding/plans",
  "architecture/scaffolding/receipts",
];

function parseArguments(argv) {
  const rootIndex = argv.indexOf("--root");
  const baseIndex = argv.indexOf("--base");
  if (rootIndex !== -1 && !argv[rootIndex + 1]) {
    throw new Error("--root requires a path");
  }
  if (baseIndex !== -1 && !argv[baseIndex + 1]) {
    throw new Error("--base requires a Git revision");
  }
  const root =
    rootIndex === -1 ? defaultRepositoryRoot : path.resolve(argv[rootIndex + 1]);
  return { base: baseIndex === -1 ? null : argv[baseIndex + 1], root };
}

export function validateQualificationHistoryEntries(entries) {
  const errors = [];
  for (const entry of entries) {
    const [status, ...paths] = entry.split("\t");
    if (status === "A") {
      continue;
    }
    errors.push(
      `ARCH-EVIDENCE-IMMUTABLE-001 ${paths.join(" -> ")}: published architecture evidence is append-only; Git status ${status} is forbidden`,
    );
  }
  return errors;
}

export async function validateQualificationRecordHistory(
  repositoryRoot,
  base = null,
) {
  const argumentsList = ["diff", "--name-status", "--find-renames"];
  if (base) {
    argumentsList.push(base, "HEAD");
  } else {
    argumentsList.push("HEAD");
  }
  argumentsList.push("--", ...immutableRoots);
  const { stdout } = await execFileAsync("git", argumentsList, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  const entries = stdout
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return validateQualificationHistoryEntries(entries);
}

async function main() {
  const { base, root } = parseArguments(process.argv.slice(2));
  const errors = await validateQualificationRecordHistory(root, base);
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error);
    }
    process.exitCode = 1;
    return;
  }
  console.log("Architecture evidence history valid: append-only policy preserved.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
