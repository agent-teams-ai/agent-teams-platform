import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import YAML from "yaml";

const defaultRepositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const workflowDirectory = ".github/workflows";
const workflowName = "reviewrouter-review.yml";
const retiredWorkflows = ["reviewrouter-codex.yml", "reviewrouter-interaction.yml"];

// Preserve the Gateway caller selected by the owner-approved migration. This
// qualifies local authority; it does not certify an immutable upstream runtime.
const expectedWorkflow = {
  name: "ReviewRouter",
  "run-name": "${{ format('ReviewRouter review {0}', inputs.review_request_id) }}",
  on: {
    workflow_dispatch: {
      inputs: {
        review_request_id: { required: true, type: "string" },
        pr_number: { required: true, type: "string" },
        review_head_sha: { required: true, type: "string" },
      },
    },
  },
  permissions: {},
  jobs: {
    review: {
      if: "${{ inputs.review_request_id != '' && inputs.pr_number != '' && inputs.review_head_sha != '' }}",
      concurrency: {
        group: "reviewrouter-request-${{ github.repository_id }}-${{ inputs.review_request_id }}",
        "cancel-in-progress": false,
      },
      permissions: {
        contents: "read",
        "pull-requests": "read",
        "id-token": "write",
      },
      uses: "777genius/review-router/.github/workflows/reviewrouter-runtime.yml@workflow-v1",
      with: {
        review_request_id: "${{ inputs.review_request_id }}",
        pr_number: "${{ inputs.pr_number }}",
        review_head_sha: "${{ inputs.review_head_sha }}",
      },
    },
  },
};

export function validateReviewRouterWorkflow(source: string): string[] {
  let document: unknown;
  try {
    document = YAML.parse(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [`RR-GATEWAY-YAML-001 invalid Gateway workflow YAML: ${message}`];
  }
  if (!isDeepStrictEqual(document, expectedWorkflow)) {
    return [
      "RR-GATEWAY-AUTHORITY-001 Gateway caller must preserve the exact reviewed dispatch inputs, request guard and serialization, read/OIDC permissions, runtime selection, bound forwarding, and secret isolation without extra keys or jobs",
    ];
  }
  return [];
}

export async function validateRepositoryReviewRouterWorkflow(
  repositoryRoot: string = defaultRepositoryRoot,
): Promise<string[]> {
  const directory = path.join(repositoryRoot, workflowDirectory);
  const [source, files] = await Promise.all([
    readFile(path.join(directory, workflowName), "utf8"),
    readdir(directory),
  ]);
  return [
    ...validateReviewRouterWorkflow(source),
    ...retiredWorkflows
      .filter((name) => files.includes(name))
      .map(
        (name) =>
          `RR-GATEWAY-RETIRED-001 retired credential-bearing workflow must remain absent: ${name}`,
      ),
  ];
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const errors = await validateRepositoryReviewRouterWorkflow();
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("ReviewRouter Gateway caller authority is qualified.");
  }
}
