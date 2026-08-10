import assert from "node:assert/strict";
import test from "node:test";

import { domainTraces } from "./managed-scope-admission-domain-adapter.mjs";
import { assertResumeEvidence } from "./managed-scope-admission-invariants.mjs";

test("production retry and blocked-reason cancellation mutants are killed", async () => {
  for (const evidence of await domainTraces.productionRecoverableCancellationEvidence()) {
    assert.equal(evidence.resultKind, "cancelled", evidence.reason);
    assert.deepEqual(evidence.after, {
      ...evidence.before,
      state: "blocked",
      authority: "closed",
      reconciliation: "clear",
      revision: evidence.before.revision + 1,
      blockReason: "USER_CANCELLED",
      hasDispatchAuthority: false,
    }, evidence.reason);
  }
});

test("production blocked-reason resume mutants are killed", async () => {
  for (const evidence of await domainTraces.productionBlockedResumeEvidence()) {
    assertResumeEvidence(evidence);
  }
});
