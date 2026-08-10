import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getShortestPaths } from "@xstate/graph";

import { domainTraces } from "./managed-scope-admission-domain-adapter.mjs";
import {
  assertBlockedParity,
  assertCrossAxisInvariants,
  assertProcessParity,
  assertReadyParity,
} from "./managed-scope-admission-invariants.mjs";
import {
  createManagedScopeAdmissionModel,
  runTrace,
  serializeModelState,
  specification,
} from "./managed-scope-admission-model.mjs";
import { renderManagedScopeAdmissionDiagram } from "./render-managed-scope-admission-diagram.mjs";

const traces = JSON.parse(
  await readFile(
    new URL(
      "../fixtures/proof-artifacts/managed-scope-admission-traces.json",
      import.meta.url,
    ),
    "utf8",
  ),
).traces;
const committedDiagram = await readFile(
  new URL(
    "../fixtures/proof-artifacts/managed-scope-admission-model.mmd",
    import.meta.url,
  ),
  "utf8",
);

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
  assert.ok(
    first.some(
      ({ state }) => state.context.blockReason === "DATA_INTEGRITY_CONFLICT",
    ),
  );
  assert.ok(
    first.some(
      ({ state }) =>
        state.context.blockReason === "AUTHORITY_RECHECK_EXHAUSTED",
    ),
  );
});

test("matches aggregate lost-ack cancellation and successor fencing", () => {
  const model = runTrace(traces.lostAcknowledgementCancellationResume);
  const domain = domainTraces.lostAckCancellationResume();
  assertProcessParity(model, domain);
});

test("matches dispatch-committed retry authority release", () => {
  assertProcessParity(
    runTrace(traces.dispatchCommittedRetry),
    domainTraces.dispatchCommittedRetry(),
  );
  assertBlockedParity(
    runTrace(traces.dispatchCommittedRetryExhausted),
    domainTraces.dispatchCommittedRetryExhausted(),
  );
});

test("matches rejected and stale receipt successor resets", () => {
  for (const traceName of ["rejectedReceiptResume", "staleReceiptResume"]) {
    assertProcessParity(runTrace(traces[traceName]), domainTraces[traceName]());
  }
});

test("matches direct and retained-receipt ready authority", () => {
  const direct = runTrace(traces.directReady);
  assertReadyParity(direct, domainTraces.ready());

  const resumed = runTrace(traces.retainedReceiptReady);
  assertReadyParity(resumed, domainTraces.resumedReady());
  assert.equal(resumed.context.dispatchAuthorityPresent, false);
  assert.equal(resumed.context.admissionAuthorityPresent, true);
});

test("matches every integrity-conflict entry and authority-recheck exhaustion", () => {
  for (const traceName of [
    "primaryIntegrityConflict",
    "reconciliationIntegrityConflict",
    "cancellationIntegrityConflict",
    "integrityConflict",
  ]) {
    assertBlockedParity(runTrace(traces[traceName]), domainTraces[traceName]());
  }
  assertBlockedParity(
    runTrace(traces.authorityRecheckExhausted),
    domainTraces.authorityRecheckExhausted(),
  );
  assertReadyParity(
    runTrace(traces.authorityRecheckRecovery),
    domainTraces.authorityRecheckRecovery(),
  );
});

test("matches production pre-dispatch commercial denial and retry exhaustion", async () => {
  assert.deepEqual(await domainTraces.productionCommercialDenialEvidence(), {
    resultKind: "blocked",
    observedReason: "COMMERCIAL_RESTRICTION",
    denialCalls: 1,
    releaseCalls: 0,
    releaseExhausted: null,
  });
  assert.deepEqual(await domainTraces.productionCommercialExhaustionEvidence(), {
    resultKind: "blocked",
    observedReason: "COMMERCIAL_RESTRICTION",
    denialCalls: 0,
    releaseCalls: 1,
    releaseExhausted: true,
  });
  assert.deepEqual(await domainTraces.productionCommercialRetryEvidence(), {
    resultKind: "retry",
    observedReason: "COMMERCIAL_RESTRICTION",
    denialCalls: 0,
    releaseCalls: 1,
    releaseExhausted: false,
  });
  assertBlockedParity(
    runTrace(traces.preDispatchCommercialRestriction),
    domainTraces.preDispatchCommercialRestriction(),
  );
  assertBlockedParity(
    runTrace(traces.commercialRetryExhausted),
    domainTraces.commercialRetryExhausted(),
  );
});

test("matches exact denial, cancellation and downstream receipt mappings", () => {
  for (const traceName of [
    "preDispatchAuthorityDenied",
    "safeCancellation",
    "admittedReceiptSafeCancellation",
    "blockedAuthorityCancellation",
    "blockedRejectedCancellation",
    "rejectedReceipt",
    "staleReceipt",
    "conflictReceipt",
    "reconciledRejectedReceipt",
    "reconciledStaleReceipt",
    "reconciledConflictReceipt",
    "retryExhausted",
    "reconciliationRetryExhausted",
    "afterReceiptAuthorityDenied",
    "afterReceiptCommercialRestriction",
    "reconciledCancellation",
    "reconciledAdmittedCancellation",
    "reconciledRejectedCancellation",
    "reconciledStaleCancellation",
    "reconciledConflictCancellation",
  ]) {
    assertBlockedParity(runTrace(traces[traceName]), domainTraces[traceName]());
  }
});

test("JSON vocabulary has exact executable domain evidence", () => {
  const evidence = domainTraces.vocabularyEvidence();
  assert.deepEqual(evidence.receiptKinds, specification.vocabulary.receiptKinds);
  assert.deepEqual(evidence.blockReasons, specification.vocabulary.blockReasons);
});

test("committed Mermaid has exact deterministic parity with every JSON event", () => {
  assert.equal(
    committedDiagram,
    renderManagedScopeAdmissionDiagram(specification),
  );
  const eventLabels = [...committedDiagram.matchAll(/: ([A-Z][A-Z0-9_]*)$/gmu)]
    .map((match) => match[1]);
  assert.deepEqual(
    [...new Set(eventLabels)].toSorted(),
    specification.events.map(({ type }) => type).toSorted(),
  );
});

test("Mermaid parity rejects authoritative transition drift", () => {
  const drifted = structuredClone(specification);
  drifted.events.find(({ type }) => type === "OBSERVE_INTEGRITY_CONFLICT").to =
    "ready";
  assert.notEqual(
    committedDiagram,
    renderManagedScopeAdmissionDiagram(drifted),
  );
});

test("Mermaid aliases remain injective for punctuation-equivalent state names", () => {
  const counterexample = structuredClone(specification);
  counterexample.axes.lifecycle.states = ["retry-wait", "retry_wait"];
  counterexample.axes.lifecycle.initial = "retry-wait";
  counterexample.events = [
    {
      type: "COLLISION_PROBE",
      from: ["retry-wait"],
      to: "retry_wait",
      effects: { set: {}, increment: ["revision"] },
    },
  ];
  const rendered = renderManagedScopeAdmissionDiagram(counterexample);
  assert.match(rendered, /state "retry-wait" as lifecycle_0/u);
  assert.match(rendered, /state "retry_wait" as lifecycle_1/u);
  assert.match(rendered, /lifecycle_0 --> lifecycle_1: COLLISION_PROBE/u);
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
  assert.equal(
    exhausted.context.attemptCount,
    specification.witnessBounds.attempts,
  );

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

test("production stale generation command is an exact no-op", async () => {
  const evidence = await domainTraces.productionStaleGenerationEvidence();
  assert.equal(evidence.resultKind, "stale");
  assert.deepEqual(evidence.after, evidence.before);
});

test("production stale process revision is an exact no-op", async () => {
  const evidence = await domainTraces.productionStaleRevisionEvidence();
  assert.equal(evidence.resultKind, "stale");
  assert.deepEqual(evidence.after, evidence.before);
});

test("matches admitted recovery from reconciliation", async () => {
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

test("matches cancellation directly from committed dispatch authority", async () => {
  const evidence =
    await domainTraces.productionDispatchCommittedCancellationEvidence();
  assert.equal(evidence.resultKind, "reconciliation-required");
  assertProcessParity(
    runTrace(["CLAIM", "AUTHORIZE_DISPATCH", "CANCEL_UNCERTAIN"]),
    evidence.process,
  );
});

test("production integrity block is cancellation-invariant", async () => {
  const evidence =
    await domainTraces.productionIntegrityCancellationNoOpEvidence();
  assert.equal(evidence.resultKind, "already-completed");
  assert.equal(evidence.before.blockReason, "DATA_INTEGRITY_CONFLICT");
  assert.deepEqual(evidence.after, evidence.before);
});

test("production protected terminal states are cancellation-invariant", async () => {
  const evidence =
    await domainTraces.productionProtectedCancellationNoOpEvidence();
  for (const [name, terminal] of Object.entries(evidence)) {
    assert.equal(
      terminal.resultKind,
      name === "userCancelled" ? "cancelled" : "already-completed",
      name,
    );
    assert.deepEqual(terminal.after, terminal.before, name);
  }
  assert.equal(evidence.ready.before.state, "ready");
  assert.equal(
    evidence.downstreamConflict.before.blockReason,
    "DOWNSTREAM_CONFLICT",
  );
  assert.equal(evidence.userCancelled.before.blockReason, "USER_CANCELLED");
});

test("production pending cancellation is repeat-command invariant", async () => {
  const evidence =
    await domainTraces.productionPendingCancellationNoOpEvidence();
  assert.equal(evidence.resultKind, "reconciliation-required");
  assert.equal(evidence.before.state, "cancel-reconcile-required");
  assert.deepEqual(evidence.after, evidence.before);
});
