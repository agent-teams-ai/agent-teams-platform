import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = path.resolve(scriptDirectory, "../..");
const workflowPath = ".github/workflows/reviewrouter-interaction.yml";
const expectedSourceSha256 =
  "336a904791d2e84164b44b2342aa5acc6d63cff36aac71cbce80a8c6fc8b8843";

export function validateReviewRouterInteractionSource(source) {
  if (
    typeof source !== "string" ||
    createHash("sha256").update(source).digest("hex") !== expectedSourceSha256
  ) {
    return [
      "RR-INTERACTION-CANONICAL-001 interaction workflow must match the exact qualified canonical V2 source",
    ];
  }
  return [];
}

export async function validateReviewRouterInteractionWorkflow(
  repositoryRoot = defaultRepositoryRoot,
) {
  const source = await readFile(path.join(repositoryRoot, workflowPath), "utf8");
  return validateReviewRouterInteractionSource(source);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = await validateReviewRouterInteractionWorkflow();
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(
      "ReviewRouter interaction workflow matches the exact canonical V2 source.",
    );
  }
}
