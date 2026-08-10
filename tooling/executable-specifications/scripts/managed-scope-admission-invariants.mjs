import assert from "node:assert/strict";

import { specification } from "./managed-scope-admission-model.mjs";

export function assertCrossAxisInvariants(
  snapshot,
  bounds = specification.witnessBounds,
) {
  const context = snapshot.context;
  assert.ok(specification.axes.lifecycle.states.includes(snapshot.value));
  assert.ok(specification.axes.authority.states.includes(context.authority));
  assert.ok(
    specification.axes.reconciliation.states.includes(context.reconciliation),
  );
  assert.ok(context.generation >= specification.axes.generation.minimum);
  assert.ok(context.generation <= bounds.generations);
  assert.ok(context.attemptCount <= bounds.attempts);
  assert.ok(context.resumptionCount <= bounds.generations);

  if (snapshot.value === "blocked") {
    assert.ok(specification.vocabulary.blockReasons.includes(context.blockReason));
  } else {
    assert.equal(context.blockReason, null);
  }

  if (snapshot.value === "ready") {
    assert.equal(context.receipt, "admitted");
    assert.equal(context.authority, "admission-authorized");
    assert.equal(context.reconciliation, "clear");
    assert.equal(context.admissionAuthorityPresent, true);
  }
  if (snapshot.value === "reconcile-required") {
    assert.equal(context.authority, "dispatch-authorized");
    assert.equal(context.reconciliation, "outcome-unknown");
  }
  if (
    snapshot.value === "retry-wait" ||
    context.blockReason === "SAFE_RETRY_EXHAUSTED"
  ) {
    assert.equal(context.dispatchAuthorityPresent, false);
  }
  if (snapshot.value === "cancel-reconcile-required") {
    assert.equal(context.reconciliation, "cancellation-unknown");
  }
  const reasonByReceipt = {
    rejected: "DOWNSTREAM_REJECTED",
    stale: "DOWNSTREAM_STALE",
    conflict: "DOWNSTREAM_CONFLICT",
  };
  if (
    context.receipt in reasonByReceipt &&
    context.blockReason !== "USER_CANCELLED"
  ) {
    assert.equal(context.blockReason, reasonByReceipt[context.receipt]);
    assert.equal(context.reconciliation, "clear");
  }
  if (context.blockReason === "USER_CANCELLED") {
    assert.notEqual(context.receipt, "conflict");
    assert.equal(context.reconciliation, "clear");
  }
  if (snapshot.value === "receipt-observed") {
    assert.equal(context.receipt, "admitted");
    assert.equal(context.authority, "admission-recheck-pending");
    assert.equal(context.reconciliation, "clear");
  }
  if (context.blockReason === "DATA_INTEGRITY_CONFLICT") {
    assert.equal(snapshot.value, "blocked");
  }
  if (context.blockReason === "AUTHORITY_RECHECK_EXHAUSTED") {
    assert.equal(snapshot.value, "blocked");
    assert.equal(context.receipt, "admitted");
    assert.equal(context.admissionAuthorityPresent, false);
  }
}

export function assertProcessParity(model, domain) {
  assert.equal(model.value, domain.state);
  assert.equal(model.context.authority, domain.authority);
  assert.equal(model.context.reconciliation, domain.reconciliation);
  assert.equal(model.context.generation, domain.generation);
  assert.equal(model.context.attemptCount, domain.attemptCount);
  assert.equal(model.context.resumptionCount, domain.resumptionCount);
  assert.equal(model.context.blockReason, domain.blockReason);
  assert.equal(model.context.receipt, domain.receiptKind);
  assert.equal(model.context.revision, domain.revision);
  assert.equal(
    model.context.dispatchAuthorityPresent,
    domain.hasDispatchAuthority,
  );
  assert.equal(
    model.context.admissionAuthorityPresent,
    domain.hasAdmissionAuthority,
  );
}

export function assertReadyParity(model, domain) {
  assertProcessParity(model, domain);
}

export function assertBlockedParity(model, domain) {
  assertProcessParity(model, domain);
  assert.equal(model.context.blockReason, domain.blockReason);
}

function recoveryPredecessor({
  state = "blocked",
  authority = "closed",
  revision,
  attemptCount = 1,
  receiptKind = null,
  blockReason = null,
  hasDispatchAuthority = false,
}) {
  return {
    state,
    authority,
    reconciliation: "clear",
    generation: 1,
    revision,
    attemptCount,
    resumptionCount: 0,
    receiptKind,
    blockReason,
    hasDispatchAuthority,
    hasAdmissionAuthority: false,
  };
}

const recoveryPredecessors = Object.freeze({
  RETRY_WAIT: recoveryPredecessor({
    state: "retry-wait",
    authority: "creation-authorized",
    revision: 3,
  }),
  AUTHORITY_DENIED_PRE_DISPATCH: recoveryPredecessor({
    authority: "denied",
    revision: 3,
    blockReason: "AUTHORITY_DENIED",
  }),
  AUTHORITY_DENIED_AFTER_RECEIPT: recoveryPredecessor({
    authority: "denied",
    revision: 5,
    receiptKind: "admitted",
    blockReason: "AUTHORITY_DENIED",
    hasDispatchAuthority: true,
  }),
  AUTHORITY_DENIED_RECONCILED_ADMITTED: recoveryPredecessor({
    authority: "denied",
    revision: 6,
    receiptKind: "admitted",
    blockReason: "AUTHORITY_DENIED",
    hasDispatchAuthority: true,
  }),
  COMMERCIAL_RESTRICTION_PRE_DISPATCH: recoveryPredecessor({
    authority: "commercially-restricted",
    revision: 3,
    blockReason: "COMMERCIAL_RESTRICTION",
  }),
  COMMERCIAL_RESTRICTION_AFTER_RECEIPT: recoveryPredecessor({
    authority: "commercially-restricted",
    revision: 5,
    receiptKind: "admitted",
    blockReason: "COMMERCIAL_RESTRICTION",
    hasDispatchAuthority: true,
  }),
  COMMERCIAL_RESTRICTION_AFTER_RECEIPT_UNAVAILABLE: recoveryPredecessor({
    authority: "commercially-restricted",
    revision: 5,
    receiptKind: "admitted",
    blockReason: "COMMERCIAL_RESTRICTION",
    hasDispatchAuthority: true,
  }),
  COMMERCIAL_RESTRICTION_RECONCILED_ADMITTED: recoveryPredecessor({
    authority: "commercially-restricted",
    revision: 6,
    receiptKind: "admitted",
    blockReason: "COMMERCIAL_RESTRICTION",
    hasDispatchAuthority: true,
  }),
  USER_CANCELLED_NO_RECEIPT: recoveryPredecessor({
    revision: 2,
    attemptCount: 0,
    blockReason: "USER_CANCELLED",
  }),
  USER_CANCELLED_ADMITTED: recoveryPredecessor({
    revision: 5,
    receiptKind: "admitted",
    blockReason: "USER_CANCELLED",
  }),
  USER_CANCELLED_REJECTED: recoveryPredecessor({
    revision: 5,
    receiptKind: "rejected",
    blockReason: "USER_CANCELLED",
  }),
  USER_CANCELLED_STALE: recoveryPredecessor({
    revision: 5,
    receiptKind: "stale",
    blockReason: "USER_CANCELLED",
  }),
  SAFE_RETRY_EXHAUSTED: recoveryPredecessor({
    revision: 3,
    blockReason: "SAFE_RETRY_EXHAUSTED",
  }),
  DOWNSTREAM_REJECTED: recoveryPredecessor({
    revision: 4,
    receiptKind: "rejected",
    blockReason: "DOWNSTREAM_REJECTED",
    hasDispatchAuthority: true,
  }),
  DOWNSTREAM_STALE: recoveryPredecessor({
    revision: 4,
    receiptKind: "stale",
    blockReason: "DOWNSTREAM_STALE",
    hasDispatchAuthority: true,
  }),
  AUTHORITY_RECHECK_EXHAUSTED: recoveryPredecessor({
    revision: 5,
    receiptKind: "admitted",
    blockReason: "AUTHORITY_RECHECK_EXHAUSTED",
    hasDispatchAuthority: true,
  }),
});

export function assertRecoveryPredecessor(evidence) {
  assert.deepEqual(
    evidence.predecessor ?? evidence.before,
    recoveryPredecessors[evidence.reason],
    evidence.reason,
  );
}

export function assertResumeEvidence(evidence) {
  assertRecoveryPredecessor(evidence);
  const retained = evidence.predecessor.receiptKind === "admitted";
  assert.deepEqual(evidence.first, {
    kind: "accepted",
    generation: evidence.predecessor.generation + (retained ? 0 : 1),
    predecessorReceiptRetained: retained,
    replayed: false,
  }, evidence.reason);
  assert.deepEqual(evidence.replay, {
    ...evidence.first,
    replayed: true,
  }, evidence.reason);
  assert.deepEqual(evidence.successor, {
    state: retained ? "receipt-observed" : "requested",
    authority: retained ? "admission-recheck-pending" : "creation-authorized",
    reconciliation: "clear",
    generation: evidence.predecessor.generation + (retained ? 0 : 1),
    revision: evidence.predecessor.revision + 1,
    attemptCount: 0,
    resumptionCount: evidence.predecessor.resumptionCount + 1,
    receiptKind: retained ? "admitted" : null,
    blockReason: null,
    hasDispatchAuthority: false,
    hasAdmissionAuthority: false,
  }, evidence.reason);
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
