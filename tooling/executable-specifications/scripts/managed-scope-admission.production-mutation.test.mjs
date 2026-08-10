import assert from "node:assert/strict";
import test from "node:test";

import { domainTraces } from "./managed-scope-admission-domain-adapter.mjs";

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
    const retained = evidence.predecessor.receiptKind === "admitted";
    assert.equal(evidence.first.kind, "accepted", evidence.reason);
    assert.equal(
      evidence.first.generation,
      evidence.predecessor.generation + (retained ? 0 : 1),
      evidence.reason,
    );
    assert.equal(
      evidence.first.predecessorReceiptRetained,
      retained,
      evidence.reason,
    );
    assert.equal(evidence.first.replayed, false, evidence.reason);
    assert.deepEqual(evidence.replay, {
      ...evidence.first,
      replayed: true,
    }, evidence.reason);
    assert.equal(
      evidence.successor.resumptionCount,
      evidence.predecessor.resumptionCount + 1,
      evidence.reason,
    );
    assert.equal(
      evidence.successor.receiptKind,
      retained ? "admitted" : null,
      evidence.reason,
    );
    assert.equal(
      evidence.successorCommandId === evidence.predecessorCommandId,
      retained,
      evidence.reason,
    );
    assert.equal(
      evidence.outboxesAfter,
      evidence.outboxesBefore + (retained ? 0 : 1),
      evidence.reason,
    );
  }
});
