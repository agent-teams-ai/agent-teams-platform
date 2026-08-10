import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getShortestPaths } from "@xstate/graph";
import {
  array,
  assert as assertProperty,
  constantFrom,
  property,
} from "fast-check";
import { assign, createActor, createMachine } from "xstate";

import {
  domainLostAckCancellationResumeTrace,
  domainReadyTrace,
  domainResumedReadyTrace,
} from "../../packages/contexts/project-management/dist/features/managed-project-scope-admission/__tests__/model-conformance-fixture.js";

const spec = JSON.parse(
  await readFile(
    new URL(
      "../../architecture/project-management/managed-scope-admission-process.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

function applyTransition(context, transition) {
  const update = { ...transition.effects.set };
  for (const field of transition.effects.increment) {
    update[field] = context[field] + 1;
  }
  return Object.freeze({ ...context, ...update });
}

function predicateAllows(context, predicate, modelSpec) {
  switch (predicate.operator) {
    case "less-than-limit":
      return context[predicate.field] < modelSpec.limits[predicate.limit];
    case "at-least-limit":
      return context[predicate.field] >= modelSpec.limits[predicate.limit];
    case "equals":
      return context[predicate.field] === predicate.value;
    case "not-equals":
      return context[predicate.field] !== predicate.value;
    case "not-in":
      return !predicate.values.includes(context[predicate.field]);
  }
  throw new Error(`Unknown predicate operator ${predicate.operator}.`);
}

function guardAllows(context, transition, modelSpec) {
  return (transition.guard?.all ?? []).every((predicate) =>
    predicateAllows(context, predicate, modelSpec),
  );
}

function createModel(modelSpec = spec) {
  const states = Object.fromEntries(
    modelSpec.axes.lifecycle.states.map((state) => [
      state,
      {
        on: Object.fromEntries(
          modelSpec.events
            .filter((event) => event.from.includes(state))
            .map((event) => [
              event.type,
              {
                target: event.to === "$same" ? state : event.to,
                guard: ({ context }) =>
                  guardAllows(context, event, modelSpec),
                actions: assign(({ context }) =>
                  applyTransition(context, event),
                ),
              },
            ]),
        ),
      },
    ]),
  );
  return createMachine({
    id: modelSpec.id,
    context: Object.freeze(structuredClone(modelSpec.initialContext)),
    initial: modelSpec.axes.lifecycle.initial,
    states,
  });
}

function serializeState(state) {
  return JSON.stringify({ value: state.value, ...state.context });
}

function pathSignatures(paths) {
  return paths
    .map((path) => path.steps.map((step) => step.event.type).join(" > "))
    .toSorted();
}

function sendTrace(actor, events) {
  for (const type of events) {
    actor.send({ type });
  }
  return actor.getSnapshot();
}

function assertCrossAxisInvariants(snapshot) {
  const context = snapshot.context;
  assert.ok(spec.axes.lifecycle.states.includes(snapshot.value));
  assert.ok(spec.axes.authority.states.includes(context.authority));
  assert.ok(spec.axes.reconciliation.states.includes(context.reconciliation));
  assert.ok(context.generation >= 1);
  assert.ok(context.generation <= spec.limits.generations);
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

function assertReadyParity(model, domain) {
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

test("derives deterministic JSON paths across every modeled axis", () => {
  const options = {
    events: spec.events.map(({ type }) => ({ type })),
    serializeState,
  };
  const first = getShortestPaths(createModel(), options);
  const second = getShortestPaths(createModel(), options);
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

test("matches aggregate semantics for lost ack, cancellation and successor fencing", () => {
  const actor = createActor(createModel()).start();
  const model = sendTrace(actor, [
    "CLAIM",
    "AUTHORIZE_DISPATCH",
    "LOSE_ACKNOWLEDGEMENT",
    "CANCEL_UNCERTAIN",
    "CANCEL_RECONCILED",
    "RESUME_NEW_GENERATION",
  ]);

  const domain = domainLostAckCancellationResumeTrace();

  assert.equal(model.value, domain.state);
  assert.equal(model.context.generation, domain.generation);
  assert.equal(model.context.revision, domain.revision);
  assert.equal(model.context.attemptCount, domain.attemptCount);
  assert.equal(model.context.blockReason, domain.blockReason);
});

test("matches aggregate ready preconditions", () => {
  const actor = createActor(createModel()).start();
  const model = sendTrace(actor, [
    "CLAIM",
    "AUTHORIZE_DISPATCH",
    "OBSERVE_ADMITTED",
    "FINALIZE_READY",
  ]);

  const domain = domainReadyTrace();

  assertReadyParity(model, domain);
});

test("matches retained-receipt resume without restoring dispatch authority", () => {
  const actor = createActor(createModel()).start();
  const model = sendTrace(actor, [
    "CLAIM",
    "AUTHORIZE_DISPATCH",
    "OBSERVE_ADMITTED",
    "DENY_AFTER_RECEIPT",
    "RESUME_ADMITTED",
    "FINALIZE_READY",
  ]);
  const domain = domainResumedReadyTrace();

  assertReadyParity(model, domain);
  assert.equal(model.context.generation, domain.generation);
  assert.equal(model.context.dispatchAuthorityPresent, false);
  assert.equal(model.context.admissionAuthorityPresent, true);
});

test("detects semantically valid JSON effect drift against the aggregate", () => {
  const drifted = structuredClone(spec);
  const finalize = drifted.events.find(({ type }) => type === "FINALIZE_READY");
  finalize.effects.set.admissionAuthorityPresent = false;
  const actor = createActor(createModel(drifted)).start();
  const model = sendTrace(actor, [
    "CLAIM",
    "AUTHORIZE_DISPATCH",
    "OBSERVE_ADMITTED",
    "FINALIZE_READY",
  ]);

  assert.throws(() => assertReadyParity(model, domainReadyTrace()), {
    name: "AssertionError",
  });
});

test("covers retry, cancellation, stale and illegal-event paths", () => {
  const retry = createActor(createModel()).start();
  const exhausted = sendTrace(retry, [
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
  assert.equal(exhausted.context.attemptCount, spec.limits.attempts);
  assert.equal(exhausted.context.blockReason, "SAFE_RETRY_EXHAUSTED");

  const cancellation = createActor(createModel()).start();
  const cancelled = sendTrace(cancellation, [
    "CLAIM",
    "AUTHORIZE_DISPATCH",
    "LOSE_ACKNOWLEDGEMENT",
    "CANCEL_UNCERTAIN",
    "CANCEL_RECONCILED",
  ]);
  assert.equal(cancelled.value, "blocked");
  assert.equal(cancelled.context.blockReason, "USER_CANCELLED");
  assert.equal(cancelled.context.reconciliation, "clear");

  const stale = createActor(createModel()).start();
  const beforeStale = stale.getSnapshot();
  const afterStale = sendTrace(stale, ["STALE_GENERATION", "STALE_REVISION"]);
  assert.equal(afterStale.value, beforeStale.value);
  assert.deepEqual(afterStale.context, beforeStale.context);

  const illegal = createActor(createModel()).start();
  const beforeIllegal = illegal.getSnapshot();
  const afterIllegal = sendTrace(illegal, [
    "FINALIZE_READY",
    "CANCEL_RECONCILED",
    "RESUME_ADMITTED",
  ]);
  assert.equal(afterIllegal.value, beforeIllegal.value);
  assert.deepEqual(afterIllegal.context, beforeIllegal.context);
});

test("arbitrary histories preserve revision, fencing and readiness invariants", () => {
  const eventArbitrary = constantFrom(
    ...spec.events.map(({ type }) => Object.freeze({ type })),
  );
  assertProperty(
    property(array(eventArbitrary, { maxLength: 80 }), (events) => {
      const actor = createActor(createModel()).start();
      let previous = actor.getSnapshot();
      for (const event of events) {
        actor.send(event);
        const current = actor.getSnapshot();
        assert.ok(current.context.revision >= previous.context.revision);
        assert.ok(current.context.generation >= previous.context.generation);
        assertCrossAxisInvariants(current);
        if (event.type === "STALE_GENERATION" || event.type === "STALE_REVISION") {
          assert.deepEqual(current.context, previous.context);
        }
        previous = current;
      }
      actor.stop();
    }),
    { numRuns: 300, seed: 0x5c0f3 },
  );
});
