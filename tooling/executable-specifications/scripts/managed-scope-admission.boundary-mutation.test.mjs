import assert from "node:assert/strict";
import test from "node:test";

import { domainTraces } from "./managed-scope-admission-domain-adapter.mjs";
import {
  assertProcessParity,
  assertReadyParity,
} from "./managed-scope-admission-invariants.mjs";
import {
  runTrace,
  specification,
} from "./managed-scope-admission-model.mjs";

function mutateEvent(type, mutate) {
  const mutant = structuredClone(specification);
  mutate(mutant.events.find((event) => event.type === type));
  return mutant;
}

test("production wrong-digest detector supplies the integrity oracle", () => {
  for (const evidence of [
    domainTraces.primaryIntegrityConflict(),
    domainTraces.reconciliationIntegrityConflict(),
  ]) {
    assert.equal(evidence.state, "blocked");
    assert.equal(evidence.blockReason, "DATA_INTEGRITY_CONFLICT");
    assert.equal(evidence.receiptKind, null);
  }
});

test("production reconciliation supplies exact receipt terminal oracles", () => {
  for (const [evidence, receiptKind, blockReason] of [
    [domainTraces.reconciledRejectedReceipt(), "rejected", "DOWNSTREAM_REJECTED"],
    [domainTraces.reconciledStaleReceipt(), "stale", "DOWNSTREAM_STALE"],
    [domainTraces.reconciledConflictReceipt(), "conflict", "DOWNSTREAM_CONFLICT"],
  ]) {
    assert.equal(evidence.receiptKind, receiptKind);
    assert.equal(evidence.blockReason, blockReason);
    assert.equal(evidence.reconciliation, "clear");
  }
});

test("production cancellation supplies every modeled terminal oracle", () => {
  for (const [evidence, receiptKind, blockReason] of [
    [domainTraces.blockedAuthorityCancellation(), null, "USER_CANCELLED"],
    [domainTraces.blockedRejectedCancellation(), "rejected", "USER_CANCELLED"],
    [domainTraces.reconciledCancellation(), null, "USER_CANCELLED"],
    [domainTraces.reconciledAdmittedCancellation(), "admitted", "USER_CANCELLED"],
    [domainTraces.reconciledRejectedCancellation(), "rejected", "USER_CANCELLED"],
    [domainTraces.reconciledStaleCancellation(), "stale", "USER_CANCELLED"],
    [domainTraces.reconciledConflictCancellation(), "conflict", "DOWNSTREAM_CONFLICT"],
  ]) {
    assert.equal(evidence.state, "blocked");
    assert.equal(evidence.receiptKind, receiptKind);
    assert.equal(evidence.blockReason, blockReason);
  }
});

test("production stale generation fence supplies a no-op oracle", async () => {
  const evidence = await domainTraces.productionStaleGenerationEvidence();
  assert.equal(evidence.resultKind, "stale");
  assert.deepEqual(evidence.after, evidence.before);
});

test("production stale revision fence supplies a no-op oracle", async () => {
  const evidence = await domainTraces.productionStaleRevisionEvidence();
  assert.equal(evidence.resultKind, "stale");
  assert.deepEqual(evidence.after, evidence.before);
});

test("production reconciliation supplies the admitted ready oracle", async () => {
  const evidence = await domainTraces.productionReconciledAdmittedEvidence();
  assert.equal(evidence.resultKind, "receipt-recorded");
  assertReadyParity(
    runTrace([
      "CLAIM",
      "AUTHORIZE_DISPATCH",
      "LOSE_ACKNOWLEDGEMENT",
      "OBSERVE_ADMITTED",
      "FINALIZE_READY",
    ]),
    evidence.process,
  );
});

test("production cancellation supplies the committed-dispatch oracle", async () => {
  const evidence = await domainTraces.productionDispatchCommittedCancellationEvidence();
  assert.equal(evidence.resultKind, "reconciliation-required");
  assertProcessParity(
    runTrace(["CLAIM", "AUTHORIZE_DISPATCH", "CANCEL_UNCERTAIN"]),
    evidence.process,
  );
});

test("production integrity block supplies the cancellation no-op oracle", async () => {
  const evidence = await domainTraces.productionIntegrityCancellationNoOpEvidence();
  assert.equal(evidence.resultKind, "already-completed");
  assert.equal(evidence.before.blockReason, "DATA_INTEGRITY_CONFLICT");
  assert.deepEqual(evidence.after, evidence.before);
});

test("production terminal guards supply every cancellation no-op oracle", async () => {
  const evidence = await domainTraces.productionProtectedCancellationNoOpEvidence();
  for (const [name, terminal] of Object.entries(evidence)) {
    assert.equal(
      terminal.resultKind,
      name === "userCancelled" ? "cancelled" : "already-completed",
      name,
    );
    assert.deepEqual(terminal.after, terminal.before, name);
  }
  assert.equal(evidence.ready.before.state, "ready");
  assert.equal(evidence.downstreamConflict.before.blockReason, "DOWNSTREAM_CONFLICT");
  assert.equal(evidence.userCancelled.before.blockReason, "USER_CANCELLED");
});

test("production pending-cancellation guard supplies its no-op oracle", async () => {
  const evidence = await domainTraces.productionPendingCancellationNoOpEvidence();
  assert.equal(evidence.resultKind, "reconciliation-required");
  assert.equal(evidence.before.state, "cancel-reconcile-required");
  assert.deepEqual(evidence.after, evidence.before);
});

test("production resume receipt authority supplies the non-admitted oracle", async () => {
  for (const evidence of await domainTraces.productionNonAdmittedResumeEvidence()) {
    assert.equal(evidence.first.predecessorReceiptRetained, false);
    assert.equal(evidence.replay.predecessorReceiptRetained, false);
    assert.equal(evidence.replay.replayed, true);
    assert.equal(evidence.successorReceiptKind, null);
    assert.notEqual(evidence.successorCommandId, evidence.predecessorCommandId);
  }
});

for (const [eventType, field] of [
  ["STALE_GENERATION", "generation"],
  ["STALE_REVISION", "revision"],
]) {
  test(`kills ${eventType} freshness-fence mutation`, () => {
    const mutant = mutateEvent(eventType, (event) => {
      event.effects.increment = [field];
    });
    assert.throws(
      () => assert.deepEqual(
        runTrace([eventType], mutant).context,
        runTrace([eventType]).context,
      ),
      { name: "AssertionError" },
    );
  });
}

test("kills JSON vocabulary drift against executable domain evidence", () => {
  const mutant = structuredClone(specification);
  mutant.vocabulary.blockReasons = mutant.vocabulary.blockReasons.filter(
    (reason) => reason !== "DATA_INTEGRITY_CONFLICT",
  );
  assert.throws(
    () => assert.deepEqual(
      domainTraces.vocabularyEvidence().blockReasons,
      mutant.vocabulary.blockReasons,
    ),
    { name: "AssertionError" },
  );
});

test("kills commercial unavailability routed as permanent denial", async () => {
  const evidence = await domainTraces.productionCommercialRetryEvidence();
  const expected = {
    resultKind: "retry",
    observedReason: "COMMERCIAL_RESTRICTION",
    denialCalls: 0,
    releaseCalls: 1,
    releaseExhausted: false,
  };
  assert.deepEqual(evidence, expected);
  const mutant = {
    ...evidence,
    resultKind: "blocked",
    denialCalls: 1,
    releaseCalls: 0,
    releaseExhausted: null,
  };
  assert.throws(() => assert.deepEqual(mutant, expected), { name: "AssertionError" });
});
