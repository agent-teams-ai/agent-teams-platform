import assert from "node:assert/strict";
import test from "node:test";

import { domainTraces } from "./managed-scope-admission-domain-adapter.mjs";
import {
  assertBlockedParity,
  assertCrossAxisInvariants,
  assertProcessParity,
  assertReadyParity,
} from "./managed-scope-admission-invariants.mjs";
import {
  runTrace,
  specification,
} from "./managed-scope-admission-model.mjs";

function mutateEvent(type, mutate) {
  const mutant = structuredClone(specification);
  mutate(mutant.events.find((event) => event.type === type), mutant);
  return mutant;
}

const mutants = [
  {
    name: "ready without admission authority",
    model: mutateEvent("FINALIZE_READY", (event) => {
      event.effects.set.admissionAuthorityPresent = false;
    }),
    witness: ["CLAIM", "AUTHORIZE_DISPATCH", "OBSERVE_ADMITTED", "FINALIZE_READY"],
    oracle: (snapshot) => assertReadyParity(snapshot, domainTraces.ready()),
  },
  {
    name: "ready without admission-authorized axis",
    model: mutateEvent("FINALIZE_READY", (event) => {
      event.effects.set.authority = "closed";
    }),
    witness: ["CLAIM", "AUTHORIZE_DISPATCH", "OBSERVE_ADMITTED", "FINALIZE_READY"],
    oracle: (snapshot) => assertReadyParity(snapshot, domainTraces.ready()),
  },
  {
    name: "ready with unresolved reconciliation axis",
    model: mutateEvent("FINALIZE_READY", (event) => {
      event.effects.set.reconciliation = "outcome-unknown";
    }),
    witness: ["CLAIM", "AUTHORIZE_DISPATCH", "OBSERVE_ADMITTED", "FINALIZE_READY"],
    oracle: (snapshot) => assertReadyParity(snapshot, domainTraces.ready()),
  },
  {
    name: "ready advances the process generation",
    model: mutateEvent("FINALIZE_READY", (event) => {
      event.effects.increment.push("generation");
    }),
    witness: ["CLAIM", "AUTHORIZE_DISPATCH", "OBSERVE_ADMITTED", "FINALIZE_READY"],
    oracle: (snapshot) => assertReadyParity(snapshot, domainTraces.ready()),
  },
  {
    name: "ready resets the dispatch attempt count",
    model: mutateEvent("FINALIZE_READY", (event) => {
      event.effects.set.attemptCount = 0;
    }),
    witness: ["CLAIM", "AUTHORIZE_DISPATCH", "OBSERVE_ADMITTED", "FINALIZE_READY"],
    oracle: (snapshot) => assertReadyParity(snapshot, domainTraces.ready()),
  },
  {
    name: "ready consumes a preparation resumption",
    model: mutateEvent("FINALIZE_READY", (event) => {
      event.effects.increment.push("resumptionCount");
    }),
    witness: ["CLAIM", "AUTHORIZE_DISPATCH", "OBSERVE_ADMITTED", "FINALIZE_READY"],
    oracle: (snapshot) => assertReadyParity(snapshot, domainTraces.ready()),
  },
  {
    name: "ready retains a blocked reason",
    model: mutateEvent("FINALIZE_READY", (event) => {
      event.effects.set.blockReason = "AUTHORITY_DENIED";
    }),
    witness: ["CLAIM", "AUTHORIZE_DISPATCH", "OBSERVE_ADMITTED", "FINALIZE_READY"],
    oracle: (snapshot) => assertReadyParity(snapshot, domainTraces.ready()),
  },
  {
    name: "retry beyond the canonical attempt limit",
    model: mutateEvent("CLAIM", (_event, mutant) => {
      mutant.witnessBounds.attempts += 1;
    }),
    witness: [
      "CLAIM",
      "AUTHORIZE_DISPATCH",
      "RELEASE_RETRY",
      "CLAIM",
      "AUTHORIZE_DISPATCH",
      "RELEASE_RETRY",
      "CLAIM",
    ],
    oracle: assertCrossAxisInvariants,
  },
  {
    name: "dispatch-committed retry retains stale dispatch authority",
    model: mutateEvent("RELEASE_RETRY", (event) => {
      delete event.effects.set.dispatchAuthorityPresent;
    }),
    witness: ["CLAIM", "AUTHORIZE_DISPATCH", "RELEASE_RETRY"],
    oracle: (snapshot) =>
      assertProcessParity(snapshot, domainTraces.dispatchCommittedRetry()),
  },
  {
    name: "dispatch-committed exhaustion retains stale dispatch authority",
    model: mutateEvent("RELEASE_EXHAUSTED", (event) => {
      delete event.effects.set.dispatchAuthorityPresent;
    }),
    witness: [
      "CLAIM",
      "RELEASE_RETRY",
      "CLAIM",
      "AUTHORIZE_DISPATCH",
      "RELEASE_EXHAUSTED",
    ],
    oracle: (snapshot) =>
      assertBlockedParity(
        snapshot,
        domainTraces.dispatchCommittedRetryExhausted(),
      ),
  },
  {
    name: "unsubmitted dispatch exhausted before production retry policy",
    model: mutateEvent("RELEASE_EXHAUSTED", (event) => {
      event.guard.all[0].operator = "less-than-limit";
    }),
    witness: ["CLAIM", "RELEASE_EXHAUSTED"],
    oracle: (snapshot) => assert.equal(snapshot.value, "claimed"),
  },
  {
    name: "reconciliation exhausted before production retry policy",
    model: mutateEvent("RECONCILE_NOT_ACCEPTED_EXHAUSTED", (event) => {
      event.guard.all[0].operator = "less-than-limit";
    }),
    witness: [
      "CLAIM",
      "AUTHORIZE_DISPATCH",
      "LOSE_ACKNOWLEDGEMENT",
      "RECONCILE_NOT_ACCEPTED_EXHAUSTED",
    ],
    oracle: (snapshot) => assert.equal(snapshot.value, "reconcile-required"),
  },
  {
    name: "authority-recheck exhaustion misclassified as a generic denial",
    model: mutateEvent("EXHAUST_AUTHORITY_RECHECK", (event) => {
      event.effects.set.blockReason = "AUTHORITY_DENIED";
    }),
    witness: [
      "CLAIM",
      "AUTHORIZE_DISPATCH",
      "OBSERVE_ADMITTED",
      "EXHAUST_AUTHORITY_RECHECK",
    ],
    oracle: (snapshot) =>
      assertBlockedParity(snapshot, domainTraces.authorityRecheckExhausted()),
  },
  {
    name: "integrity conflict misclassified as a downstream conflict",
    model: mutateEvent("OBSERVE_INTEGRITY_CONFLICT", (event) => {
      event.effects.set.blockReason = "DOWNSTREAM_CONFLICT";
    }),
    witness: [
      "CLAIM",
      "AUTHORIZE_DISPATCH",
      "OBSERVE_ADMITTED",
      "OBSERVE_INTEGRITY_CONFLICT",
    ],
    oracle: (snapshot) =>
      assertBlockedParity(snapshot, domainTraces.integrityConflict()),
  },
  {
    name: "primary wrong-digest receipt ignored before receipt observation",
    model: mutateEvent("OBSERVE_INTEGRITY_CONFLICT", (event) => {
      event.from = event.from.filter((state) => state !== "dispatch-committed");
    }),
    witness: ["CLAIM", "AUTHORIZE_DISPATCH", "OBSERVE_INTEGRITY_CONFLICT"],
    oracle: (snapshot) =>
      assertBlockedParity(snapshot, domainTraces.primaryIntegrityConflict()),
  },
  {
    name: "cancellation reconciliation wrong-digest receipt ignored",
    model: mutateEvent("OBSERVE_INTEGRITY_CONFLICT", (event) => {
      event.from = event.from.filter(
        (state) => state !== "cancel-reconcile-required",
      );
    }),
    witness: [
      "CLAIM",
      "AUTHORIZE_DISPATCH",
      "LOSE_ACKNOWLEDGEMENT",
      "CANCEL_UNCERTAIN",
      "OBSERVE_INTEGRITY_CONFLICT",
    ],
    oracle: (snapshot) =>
      assertBlockedParity(snapshot, domainTraces.cancellationIntegrityConflict()),
  },
  {
    name: "reconciliation wrong-digest receipt ignored",
    model: mutateEvent("OBSERVE_INTEGRITY_CONFLICT", (event) => {
      event.from = event.from.filter((state) => state !== "reconcile-required");
    }),
    witness: [
      "CLAIM",
      "AUTHORIZE_DISPATCH",
      "LOSE_ACKNOWLEDGEMENT",
      "OBSERVE_INTEGRITY_CONFLICT",
    ],
    oracle: (snapshot) =>
      assertBlockedParity(
        snapshot,
        domainTraces.reconciliationIntegrityConflict(),
      ),
  },
  {
    name: "commercial denial misclassified as generic authority denial",
    model: mutateEvent("RESTRICT_DISPATCH", (event) => {
      event.effects.set.blockReason = "AUTHORITY_DENIED";
    }),
    witness: ["CLAIM", "RESTRICT_DISPATCH"],
    oracle: (snapshot) =>
      assertBlockedParity(
        snapshot,
        domainTraces.preDispatchCommercialRestriction(),
      ),
  },
  {
    name: "commercial retry exhaustion loses commercial semantics",
    model: mutateEvent("RELEASE_COMMERCIAL_EXHAUSTED", (event) => {
      event.effects.set.blockReason = "SAFE_RETRY_EXHAUSTED";
    }),
    witness: [
      "CLAIM",
      "RELEASE_RETRY",
      "CLAIM",
      "RELEASE_COMMERCIAL_EXHAUSTED",
    ],
    oracle: (snapshot) =>
      assertBlockedParity(snapshot, domainTraces.commercialRetryExhausted()),
  },
  {
    name: "commercial denial loses its authority axis",
    model: mutateEvent("RESTRICT_DISPATCH", (event) => {
      event.effects.set.authority = "denied";
    }),
    witness: ["CLAIM", "RESTRICT_DISPATCH"],
    oracle: (snapshot) =>
      assertBlockedParity(
        snapshot,
        domainTraces.preDispatchCommercialRestriction(),
      ),
  },
  {
    name: "commercial denial advances the process generation",
    model: mutateEvent("RESTRICT_DISPATCH", (event) => {
      event.effects.increment.push("generation");
    }),
    witness: ["CLAIM", "RESTRICT_DISPATCH"],
    oracle: (snapshot) =>
      assertBlockedParity(
        snapshot,
        domainTraces.preDispatchCommercialRestriction(),
      ),
  },
  {
    name: "commercial denial resets the dispatch attempt count",
    model: mutateEvent("RESTRICT_DISPATCH", (event) => {
      event.effects.set.attemptCount = 0;
    }),
    witness: ["CLAIM", "RESTRICT_DISPATCH"],
    oracle: (snapshot) =>
      assertBlockedParity(
        snapshot,
        domainTraces.preDispatchCommercialRestriction(),
      ),
  },
  {
    name: "commercial denial consumes a preparation resumption",
    model: mutateEvent("RESTRICT_DISPATCH", (event) => {
      event.effects.increment.push("resumptionCount");
    }),
    witness: ["CLAIM", "RESTRICT_DISPATCH"],
    oracle: (snapshot) =>
      assertBlockedParity(
        snapshot,
        domainTraces.preDispatchCommercialRestriction(),
      ),
  },
  {
    name: "integrity conflict leaves reconciliation unresolved",
    model: mutateEvent("OBSERVE_INTEGRITY_CONFLICT", (event) => {
      event.effects.set.reconciliation = "outcome-unknown";
    }),
    witness: [
      "CLAIM",
      "AUTHORIZE_DISPATCH",
      "LOSE_ACKNOWLEDGEMENT",
      "OBSERVE_INTEGRITY_CONFLICT",
    ],
    oracle: (snapshot) =>
      assertBlockedParity(
        snapshot,
        domainTraces.reconciliationIntegrityConflict(),
      ),
  },
  {
    name: "authority-recheck exhaustion made non-recoverable",
    model: mutateEvent("RESUME_ADMITTED", (event) => {
      event.guard.all
        .find(({ field }) => field === "blockReason")
        .values.push("AUTHORITY_RECHECK_EXHAUSTED");
    }),
    witness: [
      "CLAIM",
      "AUTHORIZE_DISPATCH",
      "OBSERVE_ADMITTED",
      "EXHAUST_AUTHORITY_RECHECK",
      "RESUME_ADMITTED",
      "FINALIZE_READY",
    ],
    oracle: (snapshot) =>
      assertReadyParity(snapshot, domainTraces.authorityRecheckRecovery()),
  },
  {
    name: "rejected receipt misclassified as stale",
    model: mutateEvent("OBSERVE_REJECTED", (event) => {
      event.effects.set.blockReason = "DOWNSTREAM_STALE";
    }),
    witness: ["CLAIM", "AUTHORIZE_DISPATCH", "OBSERVE_REJECTED"],
    oracle: (snapshot) =>
      assertBlockedParity(snapshot, domainTraces.rejectedReceipt()),
  },
  {
    name: "stale receipt misclassified as rejected",
    model: mutateEvent("OBSERVE_STALE", (event) => {
      event.effects.set.blockReason = "DOWNSTREAM_REJECTED";
    }),
    witness: ["CLAIM", "AUTHORIZE_DISPATCH", "OBSERVE_STALE"],
    oracle: (snapshot) =>
      assertBlockedParity(snapshot, domainTraces.staleReceipt()),
  },
  {
    name: "conflict receipt misclassified as rejected",
    model: mutateEvent("OBSERVE_CONFLICT", (event) => {
      event.effects.set.blockReason = "DOWNSTREAM_REJECTED";
    }),
    witness: ["CLAIM", "AUTHORIZE_DISPATCH", "OBSERVE_CONFLICT"],
    oracle: (snapshot) =>
      assertBlockedParity(snapshot, domainTraces.conflictReceipt()),
  },
  ...[
    ["OBSERVE_REJECTED", "rejected", "reconciledRejectedReceipt"],
    ["OBSERVE_STALE", "stale", "reconciledStaleReceipt"],
    ["OBSERVE_CONFLICT", "conflict", "reconciledConflictReceipt"],
  ].map(([eventType, receipt, traceName]) => ({
    name: `${receipt} reconciliation receipt leaves outcome unresolved`,
    model: mutateEvent(eventType, (event) => {
      delete event.effects.set.reconciliation;
    }),
    witness: [
      "CLAIM",
      "AUTHORIZE_DISPATCH",
      "LOSE_ACKNOWLEDGEMENT",
      eventType,
    ],
    oracle: (snapshot) =>
      assertBlockedParity(snapshot, domainTraces[traceName]()),
  })),
  {
    name: "pre-dispatch denial misclassified as commercial",
    model: mutateEvent("DENY_DISPATCH", (event) => {
      event.effects.set.blockReason = "COMMERCIAL_RESTRICTION";
    }),
    witness: ["CLAIM", "DENY_DISPATCH"],
    oracle: (snapshot) =>
      assertBlockedParity(snapshot, domainTraces.preDispatchAuthorityDenied()),
  },
  {
    name: "safe cancellation misclassified as authority denial",
    model: mutateEvent("CANCEL_SAFE", (event) => {
      event.effects.set.blockReason = "AUTHORITY_DENIED";
    }),
    witness: ["CANCEL_SAFE"],
    oracle: (snapshot) =>
      assertBlockedParity(snapshot, domainTraces.safeCancellation()),
  },
  {
    name: "safe cancellation discards an admitted receipt",
    model: mutateEvent("CANCEL_SAFE", (event) => {
      event.effects.set.receipt = null;
    }),
    witness: [
      "CLAIM",
      "AUTHORIZE_DISPATCH",
      "OBSERVE_ADMITTED",
      "CANCEL_SAFE",
    ],
    oracle: (snapshot) =>
      assertBlockedParity(
        snapshot,
        domainTraces.admittedReceiptSafeCancellation(),
      ),
  },
  {
    name: "blocked authority denial cannot be cancelled",
    model: mutateEvent("CANCEL_BLOCKED_SAFE", (event) => {
      event.guard.all[0].values.push("AUTHORITY_DENIED");
    }),
    witness: ["CLAIM", "DENY_DISPATCH", "CANCEL_BLOCKED_SAFE"],
    oracle: (snapshot) =>
      assertBlockedParity(snapshot, domainTraces.blockedAuthorityCancellation()),
  },
  {
    name: "blocked receipt cancellation discards its receipt",
    model: mutateEvent("CANCEL_BLOCKED_SAFE", (event) => {
      event.effects.set.receipt = null;
    }),
    witness: [
      "CLAIM",
      "AUTHORIZE_DISPATCH",
      "OBSERVE_REJECTED",
      "CANCEL_BLOCKED_SAFE",
    ],
    oracle: (snapshot) =>
      assertBlockedParity(snapshot, domainTraces.blockedRejectedCancellation()),
  },
  {
    name: "retry exhaustion misclassified as authority denial",
    model: mutateEvent("RELEASE_EXHAUSTED", (event) => {
      event.effects.set.blockReason = "AUTHORITY_DENIED";
    }),
    witness: ["CLAIM", "RELEASE_RETRY", "CLAIM", "RELEASE_EXHAUSTED"],
    oracle: (snapshot) =>
      assertBlockedParity(snapshot, domainTraces.retryExhausted()),
  },
  {
    name: "reconciliation exhaustion misclassified as authority denial",
    model: mutateEvent("RECONCILE_NOT_ACCEPTED_EXHAUSTED", (event) => {
      event.effects.set.blockReason = "AUTHORITY_DENIED";
    }),
    witness: [
      "CLAIM",
      "AUTHORIZE_DISPATCH",
      "LOSE_ACKNOWLEDGEMENT",
      "RECONCILE_NOT_ACCEPTED",
      "CLAIM",
      "AUTHORIZE_DISPATCH",
      "LOSE_ACKNOWLEDGEMENT",
      "RECONCILE_NOT_ACCEPTED_EXHAUSTED",
    ],
    oracle: (snapshot) =>
      assertBlockedParity(snapshot, domainTraces.reconciliationRetryExhausted()),
  },
  {
    name: "post-receipt denial misclassified as commercial",
    model: mutateEvent("DENY_AFTER_RECEIPT", (event) => {
      event.effects.set.blockReason = "COMMERCIAL_RESTRICTION";
    }),
    witness: [
      "CLAIM",
      "AUTHORIZE_DISPATCH",
      "OBSERVE_ADMITTED",
      "DENY_AFTER_RECEIPT",
    ],
    oracle: (snapshot) =>
      assertBlockedParity(snapshot, domainTraces.afterReceiptAuthorityDenied()),
  },
  {
    name: "post-receipt commercial restriction misclassified as denial",
    model: mutateEvent("RESTRICT_AFTER_RECEIPT", (event) => {
      event.effects.set.blockReason = "AUTHORITY_DENIED";
    }),
    witness: [
      "CLAIM",
      "AUTHORIZE_DISPATCH",
      "OBSERVE_ADMITTED",
      "RESTRICT_AFTER_RECEIPT",
    ],
    oracle: (snapshot) =>
      assertBlockedParity(
        snapshot,
        domainTraces.afterReceiptCommercialRestriction(),
      ),
  },
  {
    name: "reconciled cancellation misclassified as authority denial",
    model: mutateEvent("CANCEL_RECONCILED", (event) => {
      event.effects.set.blockReason = "AUTHORITY_DENIED";
    }),
    witness: [
      "CLAIM",
      "AUTHORIZE_DISPATCH",
      "LOSE_ACKNOWLEDGEMENT",
      "CANCEL_UNCERTAIN",
      "CANCEL_RECONCILED",
    ],
    oracle: (snapshot) =>
      assertBlockedParity(snapshot, domainTraces.reconciledCancellation()),
  },
  ...[
    [
      "CANCEL_RECONCILED_ADMITTED",
      "reconciledAdmittedCancellation",
      "AUTHORITY_DENIED",
    ],
    [
      "CANCEL_RECONCILED_REJECTED",
      "reconciledRejectedCancellation",
      "AUTHORITY_DENIED",
    ],
    [
      "CANCEL_RECONCILED_STALE",
      "reconciledStaleCancellation",
      "AUTHORITY_DENIED",
    ],
    [
      "CANCEL_RECONCILED_CONFLICT",
      "reconciledConflictCancellation",
      "USER_CANCELLED",
    ],
  ].map(([eventType, traceName, blockReason]) => ({
    name: `${eventType} loses its production terminal reason`,
    model: mutateEvent(eventType, (event) => {
      event.effects.set.blockReason = blockReason;
    }),
    witness: [
      "CLAIM",
      "AUTHORIZE_DISPATCH",
      "LOSE_ACKNOWLEDGEMENT",
      "CANCEL_UNCERTAIN",
      eventType,
    ],
    oracle: (snapshot) =>
      assertBlockedParity(snapshot, domainTraces[traceName]()),
  })),
  {
    name: "premature reconciliation clear after lost acknowledgement",
    model: mutateEvent("LOSE_ACKNOWLEDGEMENT", (event) => {
      event.effects.set.reconciliation = "clear";
    }),
    witness: ["CLAIM", "AUTHORIZE_DISPATCH", "LOSE_ACKNOWLEDGEMENT"],
    oracle: assertCrossAxisInvariants,
  },
  {
    name: "blocked cancellation without a block reason",
    model: mutateEvent("CANCEL_SAFE", (event) => {
      event.effects.set.blockReason = null;
    }),
    witness: ["CANCEL_SAFE"],
    oracle: assertCrossAxisInvariants,
  },
  {
    name: "retained receipt restores obsolete dispatch authority",
    model: mutateEvent("RESUME_ADMITTED", (event) => {
      event.effects.set.dispatchAuthorityPresent = true;
    }),
    witness: [
      "CLAIM",
      "AUTHORIZE_DISPATCH",
      "OBSERVE_ADMITTED",
      "DENY_AFTER_RECEIPT",
      "RESUME_ADMITTED",
      "FINALIZE_READY",
    ],
    oracle: (snapshot) => assertReadyParity(snapshot, domainTraces.resumedReady()),
  },
  {
    name: "new-generation resume does not consume a resumption",
    model: mutateEvent("RESUME_NEW_GENERATION", (event) => {
      event.effects.increment = event.effects.increment.filter(
        (field) => field !== "resumptionCount",
      );
    }),
    witness: [
      "CLAIM",
      "AUTHORIZE_DISPATCH",
      "LOSE_ACKNOWLEDGEMENT",
      "CANCEL_UNCERTAIN",
      "CANCEL_RECONCILED",
      "RESUME_NEW_GENERATION",
    ],
    oracle: (snapshot) =>
      assertProcessParity(snapshot, domainTraces.lostAckCancellationResume()),
  },
];

for (const mutant of mutants) {
  test(`kills ${mutant.name} mutant`, () => {
    const snapshot = runTrace(mutant.witness, mutant.model);
    assert.throws(() => mutant.oracle(snapshot), { name: "AssertionError" });
  });
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
    [
      domainTraces.reconciledRejectedReceipt(),
      "rejected",
      "DOWNSTREAM_REJECTED",
    ],
    [domainTraces.reconciledStaleReceipt(), "stale", "DOWNSTREAM_STALE"],
    [
      domainTraces.reconciledConflictReceipt(),
      "conflict",
      "DOWNSTREAM_CONFLICT",
    ],
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
    [
      domainTraces.reconciledConflictCancellation(),
      "conflict",
      "DOWNSTREAM_CONFLICT",
    ],
  ]) {
    assert.equal(evidence.state, "blocked");
    assert.equal(evidence.receiptKind, receiptKind);
    assert.equal(evidence.blockReason, blockReason);
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
      () =>
        assert.deepEqual(
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
    () =>
      assert.deepEqual(
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
  assert.throws(
    () => assert.deepEqual(mutant, expected),
    { name: "AssertionError" },
  );
});
