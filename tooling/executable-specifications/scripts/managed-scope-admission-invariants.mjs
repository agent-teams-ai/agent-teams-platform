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
  if (snapshot.value === "cancel-reconcile-required") {
    assert.equal(context.reconciliation, "cancellation-unknown");
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

export function assertReadyParity(model, domain) {
  assert.equal(model.value, domain.state);
  assert.equal(model.context.authority, domain.authority);
  assert.equal(model.context.reconciliation, domain.reconciliation);
  assert.equal(model.context.generation, domain.generation);
  assert.equal(model.context.attemptCount, domain.attemptCount);
  assert.equal(model.context.resumptionCount, domain.resumptionCount);
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

export function assertBlockedParity(model, domain) {
  assert.equal(model.value, domain.state);
  assert.equal(model.context.authority, domain.authority);
  assert.equal(model.context.reconciliation, domain.reconciliation);
  assert.equal(model.context.generation, domain.generation);
  assert.equal(model.context.attemptCount, domain.attemptCount);
  assert.equal(model.context.resumptionCount, domain.resumptionCount);
  assert.equal(model.context.receipt, domain.receiptKind);
  assert.equal(model.context.revision, domain.revision);
  assert.equal(model.context.blockReason, domain.blockReason);
  assert.equal(
    model.context.dispatchAuthorityPresent,
    domain.hasDispatchAuthority,
  );
  assert.equal(
    model.context.admissionAuthorityPresent,
    domain.hasAdmissionAuthority,
  );
}
