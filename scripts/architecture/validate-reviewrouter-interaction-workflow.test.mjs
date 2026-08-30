import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateReviewRouterInteractionSource,
  validateReviewRouterInteractionWorkflow,
} from "./validate-reviewrouter-interaction-workflow.mjs";

const source = await readFile(
  new URL("../../.github/workflows/reviewrouter-interaction.yml", import.meta.url),
  "utf8",
);
const canonicalSha256 =
  "0997a60c648fcb66e341d011a94ea2721585af9b1611c7e07445c372f0ac5008";

test("accepts only the exact canonical ReviewRouter interaction V2 source", async () => {
  assert.equal(createHash("sha256").update(source).digest("hex"), canonicalSha256);
  assert.deepEqual(await validateReviewRouterInteractionWorkflow(), []);
  assert.deepEqual(validateReviewRouterInteractionSource(source), []);
});

for (const [name, mutate] of [
  [
    "trigger drift",
    (candidate) =>
      candidate.replace("types: [created, edited]", "types: [created]"),
  ],
  [
    "permission expansion",
    (candidate) => candidate.replace("contents: read", "contents: write"),
  ],
  [
    "runtime ref drift",
    (candidate) =>
      candidate.replace(
        "75cbecab131d74021677fcd1fb21962994d306b8",
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ),
  ],
  [
    "GitHub token writeback",
    (candidate) => candidate.replace("app-oidc", "github-token"),
  ],
  [
    "unpinned checkout",
    (candidate) =>
      candidate.replace(
        "actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803",
        "actions/checkout@main",
      ),
  ],
  [
    "subscription auth forwarding drift",
    (candidate) =>
      candidate.replace(
        "secrets.REVIEWROUTER_CODEX_AUTH_JSON",
        "secrets.UNQUALIFIED_SECRET",
      ),
  ],
  [
    "Codex CLI version drift",
    (candidate) =>
      candidate.replace("@openai/codex@0.144.0", "@openai/codex@latest"),
  ],
  [
    "unexpected job injection",
    (candidate) =>
      `${candidate}\n  unqualified:\n    runs-on: ubuntu-latest\n    steps:\n      - run: true\n`,
  ],
  ["format-only drift", (candidate) => candidate.replace("name:", "name: ")],
]) {
  test(`rejects ${name}`, () => {
    const mutated = mutate(source);
    assert.notEqual(mutated, source);
    assert.deepEqual(validateReviewRouterInteractionSource(mutated), [
      "RR-INTERACTION-CANONICAL-001 interaction workflow must match the exact qualified canonical V2 source",
    ]);
  });
}
