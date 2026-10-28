import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  validateRepositoryReviewRouterWorkflow,
  validateReviewRouterWorkflow,
} from "./validate-reviewrouter-workflow.ts";

const source = await readFile(
  new URL("../../.github/workflows/reviewrouter-review.yml", import.meta.url),
  "utf8",
);

await test("qualifies the adopted Gateway caller while accepting harmless YAML formatting", async () => {
  assert.deepEqual(await validateRepositoryReviewRouterWorkflow(), []);
  assert.deepEqual(
    validateReviewRouterWorkflow(`# reviewed caller\n${source.replace("name:", "name: ")}`),
    [],
  );
});

const mutations = [
  ["privileged trigger", "  workflow_dispatch:", "  pull_request_target:"],
  [
    "optional head input",
    "review_head_sha: { required: true",
    "review_head_sha: { required: false",
  ],
  ["root permission expansion", "permissions: {}", "permissions: { contents: write }"],
  ["write permission", "pull-requests: read", "pull-requests: write"],
  ["missing OIDC", "id-token: write", "id-token: read"],
  [
    "unbound request",
    "review_request_id: ${{ inputs.review_request_id }}",
    "review_request_id: unbound",
  ],
  ["unbound PR", "pr_number: ${{ inputs.pr_number }}", "pr_number: unbound"],
  [
    "unbound head",
    "review_head_sha: ${{ inputs.review_head_sha }}",
    "review_head_sha: ${{ github.sha }}",
  ],
  [
    "bypassed guard",
    "    if: ${{ inputs.review_request_id != '' && inputs.pr_number != '' && inputs.review_head_sha != '' }}",
    "    if: ${{ always() }}",
  ],
  ["cross-request serialization", "-${{ inputs.review_request_id }}", "-all-requests"],
  ["request cancellation", "cancel-in-progress: false", "cancel-in-progress: true"],
  [
    "runtime selection drift",
    "reviewrouter-runtime.yml@workflow-v1",
    "reviewrouter-runtime.yml@main",
  ],
  ["secret inheritance", "    with:", "    secrets: inherit\n    with:"],
  ["local step injection", "    with:", "    steps: [{ run: untrusted }]\n    with:"],
  [
    "extra job",
    "jobs:",
    "jobs:\n  injected: { runs-on: ubuntu-latest, steps: [{ run: untrusted }] }",
  ],
  ["extra root key", "permissions: {}", "env: { EXTRA: true }\npermissions: {}"],
] as const;

for (const [name, expected, replacement] of mutations) {
  await test(`rejects ${name}`, () => {
    assert.equal(source.split(expected).length - 1, 1, "mutation must target one contract field");
    assert.match(
      validateReviewRouterWorkflow(source.replace(expected, replacement)).join("\n"),
      /RR-GATEWAY-AUTHORITY-001/u,
    );
  });
}

await test("rejects malformed YAML, duplicate authority keys, and non-workflow documents", () => {
  assert.match(validateReviewRouterWorkflow("jobs: [").join("\n"), /RR-GATEWAY-YAML-001/u);
  assert.match(
    validateReviewRouterWorkflow(`${source}permissions: {}\n`).join("\n"),
    /RR-GATEWAY-YAML-001/u,
  );
  assert.match(validateReviewRouterWorkflow("null").join("\n"), /RR-GATEWAY-AUTHORITY-001/u);
});

await test("rejects restoration of either retired credential-bearing workflow", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "platform-reviewrouter-"));
  const directory = path.join(root, ".github/workflows");
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "reviewrouter-review.yml"), source);
    for (const name of ["reviewrouter-codex.yml", "reviewrouter-interaction.yml"]) {
      await writeFile(path.join(directory, name), "name: retired\n");
      assert.deepEqual(await validateRepositoryReviewRouterWorkflow(root), [
        `RR-GATEWAY-RETIRED-001 retired credential-bearing workflow must remain absent: ${name}`,
      ]);
      await rm(path.join(directory, name));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
