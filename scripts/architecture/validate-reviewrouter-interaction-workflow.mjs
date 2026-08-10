import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import YAML from "yaml";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = path.resolve(scriptDirectory, "../..");
const workflowPath = ".github/workflows/reviewrouter-interaction.yml";
const runtimeRef = "5da51b7b71b1db9ce531f946ec2bb90411a31300";
const reusableWorkflow =
  `777genius/review-router/.github/workflows/reviewrouter-interaction-reusable.yml@${runtimeRef}`;

const expectedTriggers = {
  pull_request_review_comment: { types: ["created", "edited"] },
  issue_comment: { types: ["created", "edited"] },
  workflow_dispatch: null,
};
const expectedPermissions = {
  actions: "write",
  contents: "read",
  issues: "read",
  "pull-requests": "read",
  "id-token": "write",
};
const expectedInputs = {
  runtime_ref: runtimeRef,
  api_url: "https://api.reviewrouter.site",
  runtime_config_mode: "oidc",
  review_workflow_file: "reviewrouter-codex.yml",
  discussion_mode: "${{ vars.REVIEW_ROUTER_DISCUSSION_MODE || 'off' }}",
  discussion_model: "${{ vars.REVIEW_CODEX_MODEL || 'gpt-5.5' }}",
  discussion_reasoning_effort:
    "${{ vars.REVIEW_CODEX_EFFORT || 'xhigh' }}",
  discussion_max_per_pr:
    "${{ vars.REVIEW_ROUTER_DISCUSSION_MAX_PER_PR || '20' }}",
  discussion_max_per_thread:
    "${{ vars.REVIEW_ROUTER_DISCUSSION_MAX_PER_THREAD || '5' }}",
  discussion_timeout_seconds:
    "${{ vars.REVIEW_ROUTER_DISCUSSION_TIMEOUT_SECONDS || '60' }}",
};
const expectedSecrets = {
  REVIEW_ROUTER_LEDGER_KEY: "${{ secrets.REVIEW_ROUTER_LEDGER_KEY }}",
  CODEX_AUTH_JSON: "${{ secrets.REVIEWROUTER_CODEX_AUTH_JSON }}",
};
const expectedFilter =
  "${{ github.event_name == 'workflow_dispatch' || ((github.event_name != 'issue_comment' || github.event.issue.pull_request) && github.event.comment.user.type != 'Bot') }}";
const allowedJobKeys = new Set([
  "name",
  "if",
  "permissions",
  "uses",
  "with",
  "secrets",
]);
const copiedImplementationPatterns = [
  /actions\/checkout/u,
  /\.reviewrouter-runtime/u,
  /CODEX_HOME/u,
  /auth\.json/u,
  /npm install(?: --global| -g) @openai\/codex/u,
];

export function validateReviewRouterInteractionDocument(document) {
  const errors = [];
  const jobs = document?.jobs ?? {};
  const job = jobs.interaction ?? {};

  if (!isDeepStrictEqual(document?.on, expectedTriggers)) {
    errors.push(
      "RR-INTERACTION-TRIGGERS-001 interaction events and filters must remain exact",
    );
  }
  if (!isDeepStrictEqual(document?.permissions, {})) {
    errors.push(
      "RR-INTERACTION-PERMISSIONS-001 top-level permissions must remain empty",
    );
  }
  if (!isDeepStrictEqual(Object.keys(jobs), ["interaction"])) {
    errors.push(
      "RR-INTERACTION-THIN-001 workflow must contain only the interaction caller job",
    );
  }
  const unexpectedKeys = Object.keys(job).filter(
    (key) => !allowedJobKeys.has(key),
  );
  if (unexpectedKeys.length > 0) {
    errors.push(
      `RR-INTERACTION-THIN-002 caller job contains implementation keys: ${unexpectedKeys.join(", ")}`,
    );
  }
  if (
    copiedImplementationPatterns.some((pattern) =>
      pattern.test(JSON.stringify(job)),
    )
  ) {
    errors.push(
      "RR-INTERACTION-IMPLEMENTATION-001 checkout, auth, and runtime implementation belongs upstream",
    );
  }
  if (job.uses !== reusableWorkflow) {
    errors.push(
      `RR-INTERACTION-REF-001 reusable workflow must be pinned to ${runtimeRef}`,
    );
  }
  if (job.with?.runtime_ref !== runtimeRef) {
    errors.push(
      `RR-INTERACTION-REF-002 runtime_ref must be pinned to ${runtimeRef}`,
    );
  }
  if (job.if !== expectedFilter) {
    errors.push("RR-INTERACTION-FILTER-001 interaction filter changed");
  }
  if (!isDeepStrictEqual(job.permissions, expectedPermissions)) {
    errors.push(
      "RR-INTERACTION-PERMISSIONS-002 caller permissions must remain least-privilege",
    );
  }
  if (!isDeepStrictEqual(job.with, expectedInputs)) {
    errors.push(
      "RR-INTERACTION-INPUTS-001 reusable inputs must preserve review and discussion configuration",
    );
  }
  if (!isDeepStrictEqual(job.secrets, expectedSecrets)) {
    errors.push(
      "RR-INTERACTION-SECRETS-001 reusable secret forwarding must remain exact",
    );
  }
  return errors.toSorted();
}

export async function validateReviewRouterInteractionWorkflow(
  repositoryRoot = defaultRepositoryRoot,
) {
  const source = await readFile(path.join(repositoryRoot, workflowPath), "utf8");
  return validateReviewRouterInteractionDocument(YAML.parse(source));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = await validateReviewRouterInteractionWorkflow();
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("ReviewRouter interaction workflow is a pinned thin caller.");
  }
}
