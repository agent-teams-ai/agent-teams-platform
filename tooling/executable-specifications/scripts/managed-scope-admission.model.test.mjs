import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getShortestPaths } from "@xstate/graph";

import { domainTraces } from "./managed-scope-admission-domain-adapter.mjs";
import {
  assertCrossAxisInvariants,
  assertReadyParity,
} from "./managed-scope-admission-invariants.mjs";
import {
  createManagedScopeAdmissionModel,
  runTrace,
  serializeModelState,
  specification,
} from "./managed-scope-admission-model.mjs";

const traces = JSON.parse(
  await readFile(
    new URL(
      "../../../architecture/project-management/managed-scope-admission-traces.json",
      import.meta.url,
    ),
    "utf8",
  ),
).traces;

function pathSignatures(paths) {
  return paths
    .map((path) => path.steps.map((step) => step.event.type).join(" > "))
    .toSorted();
}

test("derives deterministic paths across every modeled axis", () => {
  const options = {
    events: specification.events.map(({ type }) => ({ type })),
    serializeState: serializeModelState,
  };
  const first = getShortestPaths(createManagedScopeAdmissionModel(), options);
  const second = getShortestPaths(createManagedScopeAdmissionModel(), options);
  assert.deepEqual(pathSignatures(first), pathSignatures(second));
  for (const path of first) {
    assertCrossAxisInvariants(path.state);
  }
  assert.ok(first.some(({ state }) => state.value === "ready"));
  assert.ok(
    first.some(
      ({ state }) => state.context.reconciliation === "outcome-unknown",
    ),
  );
  assert.ok(first.some(({ state }) => state.context.generation === 2));
});

test("matches aggregate lost-ack cancellation and successor fencing", () => {
  const model = runTrace(traces.lostAcknowledgementCancellationResume);
  const domain = domainTraces.lostAckCancellationResume();
  assert.equal(model.value, domain.state);
  assert.equal(model.context.generation, domain.generation);
  assert.equal(model.context.revision, domain.revision);
  assert.equal(model.context.attemptCount, domain.attemptCount);
  assert.equal(model.context.blockReason, domain.blockReason);
});

test("matches direct and retained-receipt ready authority", () => {
  const direct = runTrace(traces.directReady);
  assertReadyParity(direct, domainTraces.ready());

  const resumed = runTrace(traces.retainedReceiptReady);
  assertReadyParity(resumed, domainTraces.resumedReady());
  assert.equal(resumed.context.dispatchAuthorityPresent, false);
  assert.equal(resumed.context.admissionAuthorityPresent, true);
});

test("covers retry, cancellation, stale and illegal-event paths", () => {
  const exhausted = runTrace([
    "CLAIM",
    "AUTHORIZE_DISPATCH",
    "LOSE_ACKNOWLEDGEMENT",
    "RECONCILE_NOT_ACCEPTED",
    "CLAIM",
    "AUTHORIZE_DISPATCH",
    "LOSE_ACKNOWLEDGEMENT",
    "RECONCILE_NOT_ACCEPTED_EXHAUSTED",
  ]);
  assert.equal(exhausted.value, "blocked");
  assert.equal(exhausted.context.attemptCount, specification.limits.attempts);

  const cancelled = runTrace([
    "CLAIM",
    "AUTHORIZE_DISPATCH",
    "LOSE_ACKNOWLEDGEMENT",
    "CANCEL_UNCERTAIN",
    "CANCEL_RECONCILED",
  ]);
  assert.equal(cancelled.context.blockReason, "USER_CANCELLED");
  assert.equal(cancelled.context.reconciliation, "clear");

  for (const events of [
    ["STALE_GENERATION", "STALE_REVISION"],
    ["FINALIZE_READY", "CANCEL_RECONCILED", "RESUME_ADMITTED"],
  ]) {
    const unchanged = runTrace(events);
    assert.equal(unchanged.value, specification.axes.lifecycle.initial);
    assert.deepEqual(unchanged.context, specification.initialContext);
  }
});
