import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import YAML from "yaml";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = path.resolve(scriptDirectory, "../..");
const workflowPath = ".github/workflows/reviewrouter-codex.yml";
const runtimeRef = "8a0a31ae1d92c89466c8a939272a1e333e88c5a0";
const providerInstanceId = "codex-rotating:1319378484";
const secretName =
  "REVIEWROUTER_CODEX_AUTH_JSON_R1319378484_P957ae0d5acd3f9b2_E1_6804cd1888266fee50c4bc184f07e9d7";
const expectedWorkflowName =
  `ReviewRouter Codex OAuth [namespace=sns_6804cd1888266fee50c4bc184f07e9d7;epoch=1;secret=${secretName}]`;
const expectedRunName =
  "${{ format('ReviewRouter review PR {0} at {1}', github.event.pull_request.number, github.event.pull_request.head.sha) }}";

const expectedTriggers = {
  pull_request_target: {
    types: [
      "opened",
      "synchronize",
      "reopened",
      "ready_for_review",
      "converted_to_draft",
    ],
  },
  schedule: [{ cron: "17 */6 * * *" }],
};
const expectedReviewJob = {
  name: "codex-review",
  if: "${{ github.event_name == 'pull_request_target' && github.event.pull_request.head.repo.full_name == github.repository && github.event.pull_request.user.type != 'Bot' && (github.event.pull_request.draft == false || vars.REVIEW_ROUTER_REVIEW_DRAFTS == 'true') }}",
  concurrency: {
    group:
      "reviewrouter-codex-oauth-${{ github.repository_id }}-codex-rotating-1319378484",
    "cancel-in-progress": false,
  },
  permissions: {
    contents: "read",
    "pull-requests": "read",
    "id-token": "write",
  },
  uses: `777genius/review-router/.github/workflows/reviewrouter-t0-reusable.yml@${runtimeRef}`,
  with: {
    runtime_ref: runtimeRef,
    api_url: "https://api.reviewrouter.site",
    runtime_config_mode: "oidc",
    pr_number: "${{ format('{0}', github.event.pull_request.number) }}",
    review_head_sha: "${{ github.event.pull_request.head.sha }}",
    provider_instance_id: providerInstanceId,
    workflow_schema_version: 4,
    max_changed_lines: "${{ vars.REVIEW_ROUTER_MAX_CHANGED_LINES }}",
    review_timeout_minutes:
      "${{ fromJSON(vars.REVIEW_ROUTER_TIMEOUT_MINUTES || '60') }}",
  },
  secrets: {
    CODEX_AUTH_JSON: `\${{ secrets.${secretName} }}`,
  },
};
const expectedRefreshJob = {
  name: "codex-refresh",
  "runs-on": "ubuntu-24.04",
  "timeout-minutes": 60,
  concurrency: {
    group:
      "reviewrouter-codex-oauth-${{ github.repository_id }}-codex-rotating-1319378484",
    "cancel-in-progress": false,
  },
  if: "${{ github.event_name == 'schedule' }}",
  permissions: {
    "id-token": "write",
  },
  steps: [
    {
      name: "ReviewRouter Codex OAuth refresh",
      id: "refresh_codex",
      uses: `777genius/review-router@${runtimeRef}`,
      with: {
        mode: "codex-oauth-refresh",
        "api-url": "https://api.reviewrouter.site",
        "provider-instance-id": providerInstanceId,
        "workflow-schema-version": "4",
        "auth-json": `\${{ secrets.${secretName} }}`,
      },
    },
  ],
};

export function validateReviewRouterCodexDocument(document) {
  const errors = [];
  const jobs = document?.jobs ?? {};

  if (
    !isDeepStrictEqual(Object.keys(document ?? {}), [
      "name",
      "run-name",
      "on",
      "permissions",
      "jobs",
    ]) ||
    document?.name !== expectedWorkflowName ||
    document?.["run-name"] !== expectedRunName
  ) {
    errors.push("RR-CODEX-IDENTITY-001 workflow identity must remain exact");
  }
  if (!isDeepStrictEqual(document?.on, expectedTriggers)) {
    errors.push(
      "RR-CODEX-TRIGGERS-001 privileged review and refresh triggers must remain exact",
    );
  }
  if (!isDeepStrictEqual(document?.permissions, {})) {
    errors.push("RR-CODEX-PERMISSIONS-001 top-level permissions must remain empty");
  }
  if (!isDeepStrictEqual(Object.keys(jobs), ["codex-review", "codex-refresh"])) {
    errors.push("RR-CODEX-JOBS-001 workflow job inventory must remain exact");
  }
  if (!isDeepStrictEqual(jobs["codex-review"], expectedReviewJob)) {
    errors.push(
      "RR-CODEX-REVIEW-001 privileged review caller contract must remain exact and reproducible",
    );
  }
  if (!isDeepStrictEqual(jobs["codex-refresh"], expectedRefreshJob)) {
    errors.push(
      "RR-CODEX-REFRESH-001 privileged refresh contract must remain exact and reproducible",
    );
  }
  return errors.toSorted();
}

export async function validateReviewRouterCodexWorkflow(
  repositoryRoot = defaultRepositoryRoot,
) {
  const source = await readFile(path.join(repositoryRoot, workflowPath), "utf8");
  return validateReviewRouterCodexDocument(YAML.parse(source));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = await validateReviewRouterCodexWorkflow();
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("ReviewRouter Codex privileged workflow is exactly qualified.");
  }
}
