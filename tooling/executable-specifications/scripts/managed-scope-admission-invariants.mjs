import assert from "node:assert/strict";

import { specification } from "./managed-scope-admission-model.mjs";

export function assertCrossAxisInvariants(snapshot) {
  const context = snapshot.context;
  assert.ok(specification.axes.lifecycle.states.includes(snapshot.value));
  assert.ok(specification.axes.authority.states.includes(context.authority));
  assert.ok(
    specification.axes.reconciliation.states.includes(context.reconciliation),
  );
  assert.ok(context.generation >= specification.axes.generation.minimum);
  assert.ok(context.generation <= specification.limits.generations);
  assert.ok(context.attemptCount <= specification.limits.attempts);

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
}

export function assertReadyParity(model, domain) {
  assert.equal(model.value, domain.state);
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
