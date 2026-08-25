import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import YAML from "yaml";

import {
  validateReviewRouterCodexDocument,
  validateReviewRouterCodexWorkflow,
} from "./validate-reviewrouter-codex-workflow.mjs";

const document = YAML.parse(
  await readFile(
    new URL("../../.github/workflows/reviewrouter-codex.yml", import.meta.url),
    "utf8",
  ),
);

test("accepts the exact privileged ReviewRouter Codex workflow", async () => {
  assert.deepEqual(await validateReviewRouterCodexWorkflow(), []);
});

test("rejects privileged trigger and top-level permission drift", () => {
  const candidate = structuredClone(document);
  candidate.on.pull_request_target.types = ["opened"];
  candidate.permissions.contents = "write";
  const errors = validateReviewRouterCodexDocument(candidate).join("\n");
  assert.match(errors, /RR-CODEX-TRIGGERS-001/u);
  assert.match(errors, /RR-CODEX-PERMISSIONS-001/u);
});

test("rejects workflow identity and unexpected top-level keys", () => {
  const candidate = structuredClone(document);
  candidate.name = "Unqualified privileged workflow";
  candidate.unqualified = true;
  assert.match(
    validateReviewRouterCodexDocument(candidate).join("\n"),
    /RR-CODEX-IDENTITY-001/u,
  );
});

test("rejects review ref, filter, permission, input, and secret drift", () => {
  const candidate = structuredClone(document);
  const job = candidate.jobs["codex-review"];
  job.uses =
    `777genius/review-router/.github/workflows/reviewrouter-t0-reusable.yml@${"a".repeat(40)}`;
  job.if = "${{ always() }}";
  job.permissions.contents = "write";
  job.with.review_head_sha = "${{ github.sha }}";
  job.secrets.CODEX_AUTH_JSON = "${{ secrets.UNQUALIFIED_SECRET }}";
  assert.match(
    validateReviewRouterCodexDocument(candidate).join("\n"),
    /RR-CODEX-REVIEW-001/u,
  );
});

test("rejects refresh schedule, action pin, runner, and secret drift", () => {
  const candidate = structuredClone(document);
  candidate.on.schedule[0].cron = "* * * * *";
  const job = candidate.jobs["codex-refresh"];
  job["runs-on"] = "ubuntu-latest";
  job.steps[0].uses = `777genius/review-router@${"b".repeat(40)}`;
  job.steps[0].with["auth-json"] = "${{ secrets.UNQUALIFIED_SECRET }}";
  const errors = validateReviewRouterCodexDocument(candidate).join("\n");
  assert.match(errors, /RR-CODEX-TRIGGERS-001/u);
  assert.match(errors, /RR-CODEX-REFRESH-001/u);
});

test("rejects additional privileged jobs", () => {
  const candidate = structuredClone(document);
  candidate.jobs.unqualified = {
    "runs-on": "ubuntu-latest",
    permissions: { contents: "write" },
    steps: [{ run: "true" }],
  };
  assert.match(
    validateReviewRouterCodexDocument(candidate).join("\n"),
    /RR-CODEX-JOBS-001/u,
  );
});
