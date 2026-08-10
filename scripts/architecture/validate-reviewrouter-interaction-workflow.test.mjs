import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import YAML from "yaml";

import {
  validateReviewRouterInteractionDocument,
  validateReviewRouterInteractionWorkflow,
} from "./validate-reviewrouter-interaction-workflow.mjs";

const runtimeRef = "5da51b7b71b1db9ce531f946ec2bb90411a31300";
const document = YAML.parse(
  await readFile(
    new URL("../../.github/workflows/reviewrouter-interaction.yml", import.meta.url),
    "utf8",
  ),
);

test("accepts the exact pinned ReviewRouter interaction caller", async () => {
  assert.deepEqual(await validateReviewRouterInteractionWorkflow(), []);
});

test("rejects reusable workflow and runtime ref drift independently", () => {
  const wrongWorkflow = structuredClone(document);
  wrongWorkflow.jobs.interaction.uses =
    `777genius/review-router/.github/workflows/reviewrouter-interaction-reusable.yml@${"a".repeat(40)}`;
  assert.match(
    validateReviewRouterInteractionDocument(wrongWorkflow).join("\n"),
    /RR-INTERACTION-REF-001/u,
  );

  const wrongRuntime = structuredClone(document);
  wrongRuntime.jobs.interaction.with.runtime_ref = "b".repeat(40);
  const errors = validateReviewRouterInteractionDocument(wrongRuntime).join("\n");
  assert.match(errors, /RR-INTERACTION-REF-002/u);
  assert.doesNotMatch(errors, /RR-INTERACTION-REF-001/u);
  assert.equal(document.jobs.interaction.with.runtime_ref, runtimeRef);
});

test("rejects copied checkout, auth, and runtime implementation", () => {
  for (const copiedStep of [
    { uses: "actions/checkout@deadbeef" },
    { run: "printf '%s' \"$CODEX_AUTH_JSON\" > \"$CODEX_HOME/auth.json\"" },
    { run: "node .reviewrouter-runtime/dist/index.js" },
  ]) {
    const candidate = structuredClone(document);
    candidate.jobs.interaction.steps = [copiedStep];
    const errors = validateReviewRouterInteractionDocument(candidate).join("\n");
    assert.match(errors, /RR-INTERACTION-THIN-002/u);
    assert.match(errors, /RR-INTERACTION-IMPLEMENTATION-001/u);
  }
});

test("rejects expanded permissions and caller contract drift", () => {
  const candidate = structuredClone(document);
  candidate.jobs.interaction.permissions.issues = "write";
  candidate.jobs.interaction.with.discussion_mode = "off";
  candidate.jobs.interaction.secrets.CODEX_AUTH_JSON = "invented";
  const errors = validateReviewRouterInteractionDocument(candidate).join("\n");
  assert.match(errors, /RR-INTERACTION-PERMISSIONS-002/u);
  assert.match(errors, /RR-INTERACTION-INPUTS-001/u);
  assert.match(errors, /RR-INTERACTION-SECRETS-001/u);
});

test("rejects trigger, interaction filter, and review workflow drift", () => {
  const candidate = structuredClone(document);
  candidate.on.issue_comment.types = ["created"];
  candidate.jobs.interaction.if = "${{ always() }}";
  candidate.jobs.interaction.with.review_workflow_file = "reviewrouter.yml";
  const errors = validateReviewRouterInteractionDocument(candidate).join("\n");
  assert.match(errors, /RR-INTERACTION-TRIGGERS-001/u);
  assert.match(errors, /RR-INTERACTION-FILTER-001/u);
  assert.match(errors, /RR-INTERACTION-INPUTS-001/u);
});
