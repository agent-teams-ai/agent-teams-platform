import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getShortestPaths } from "@xstate/graph";
import fc from "fast-check";
import { assign, createActor, createMachine } from "xstate";

import {
  domainLostAckCancellationResumeTrace,
  domainReadyTrace,
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

const initialContext = Object.freeze({
  attemptCount: 0,
  authority: spec.axes.authority.initial,
  blockReason: null,
  generation: 1,
  receipt: null,
  reconciliation: spec.axes.reconciliation.initial,
  resumptionCount: 0,
  revision: 1,
});

function evolve(context, update) {
  return Object.freeze({ ...context, ...update, revision: context.revision + 1 });
}

function applyTransition(context, transition) {
  switch (transition.operation) {
    case "claim":
      return evolve(context, {
        attemptCount: context.attemptCount + 1,
        authority: "dispatch-recheck-pending",
      });
    case "authorize-dispatch":
      return evolve(context, { authority: "dispatch-authorized" });
    case "deny-dispatch":
      return evolve(context, {
        authority: "denied",
        blockReason: "AUTHORITY_DENIED",
      });
    case "release-retry":
      return evolve(context, {
        authority: "creation-authorized",
        reconciliation: "clear",
      });
    case "release-exhausted":
      return evolve(context, {
        authority: "closed",
        blockReason: "SAFE_RETRY_EXHAUSTED",
        reconciliation: "clear",
      });
    case "lose-acknowledgement":
      return evolve(context, { reconciliation: "outcome-unknown" });
    case "reconcile-not-accepted":
      return evolve(context, {
        authority:
          transition.variant === "exhausted"
            ? "closed"
            : "creation-authorized",
        blockReason:
          transition.variant === "exhausted" ? "SAFE_RETRY_EXHAUSTED" : null,
        reconciliation: "clear",
      });
    case "observe-admitted":
      return evolve(context, {
        authority: "admission-recheck-pending",
        receipt: "admitted",
        reconciliation: "clear",
      });
    case "observe-rejected":
    case "observe-stale":
    case "observe-conflict":
      return evolve(context, {
        authority: "closed",
        blockReason: `DOWNSTREAM_${transition.operation
          .slice("observe-".length)
          .toUpperCase()}`,
        receipt: transition.operation.slice("observe-".length),
        reconciliation: "clear",
      });
    case "finalize-ready":
      return evolve(context, { authority: "admission-authorized" });
    case "deny-after-receipt":
      return evolve(context, {
        authority:
          transition.variant === "commercial"
            ? "commercially-restricted"
            : "denied",
        blockReason:
          transition.variant === "commercial"
            ? "COMMERCIAL_RESTRICTION"
            : "AUTHORITY_DENIED",
      });
    case "cancel":
      return evolve(context, {
        authority: "closed",
        blockReason:
          transition.to === "blocked" ? "USER_CANCELLED" : context.blockReason,
        reconciliation:
          transition.to === "cancel-reconcile-required"
            ? "cancellation-unknown"
            : "clear",
      });
    case "complete-cancellation":
      return evolve(context, {
        authority: "closed",
        blockReason: "USER_CANCELLED",
        reconciliation: "clear",
      });
    case "resume":
      return evolve(context, {
        attemptCount: 0,
        authority:
          transition.variant === "retained"
            ? "admission-recheck-pending"
            : "creation-authorized",
        blockReason: null,
        generation:
          transition.variant === "retained"
            ? context.generation
            : context.generation + 1,
        receipt: transition.variant === "retained" ? context.receipt : null,
        resumptionCount: context.resumptionCount + 1,
      });
    case "ignore-stale-generation":
    case "ignore-stale-revision":
      return context;
    default:
      throw new Error(`Unknown model operation ${transition.operation}.`);
  }
}

function guardAllows(context, transition) {
  switch (transition.guard) {
    case undefined:
      return true;
    case "attempt-available":
      return context.attemptCount < spec.limits.attempts;
    case "attempt-exhausted":
      return context.attemptCount >= spec.limits.attempts;
    case "successor-generation-available":
      return (
        context.receipt !== "admitted" &&
        context.generation < spec.limits.generations &&
        !["DATA_INTEGRITY_CONFLICT", "DOWNSTREAM_CONFLICT"].includes(
          context.blockReason,
        )
      );
    case "retained-admitted-receipt":
      return (
        context.receipt === "admitted" &&
        context.resumptionCount < spec.limits.generations
      );
    default:
      return false;
  }
}

function createModel() {
  const states = Object.fromEntries(
    spec.axes.lifecycle.states.map((state) => [
      state,
      {
        on: Object.fromEntries(
          spec.events
            .filter((event) => event.from.includes(state))
            .map((event) => [
              event.type,
              {
                target: event.to === "$same" ? state : event.to,
                guard: ({ context }) => guardAllows(context, event),
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
    id: spec.id,
    context: initialContext,
    initial: spec.axes.lifecycle.initial,
    states,
  });
}

function serializeState(state) {
  return JSON.stringify({ value: state.value, ...state.context });
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
  }
  if (snapshot.value === "reconcile-required") {
    assert.equal(context.authority, "dispatch-authorized");
    assert.equal(context.reconciliation, "outcome-unknown");
  }
  if (snapshot.value === "cancel-reconcile-required") {
    assert.equal(context.reconciliation, "cancellation-unknown");
  }
}

test("derives deterministic paths across every modeled axis", () => {
  const options = {
    events: spec.events.map(({ type }) => ({ type })),
    serializeState,
  };
  const first = getShortestPaths(createModel(), options);
  const second = getShortestPaths(createModel(), options);
  const signatures = (paths) =>
    paths
      .map((path) => path.steps.map((step) => step.event.type).join(" > "))
      .toSorted();

  assert.deepEqual(signatures(first), signatures(second));
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

  assert.equal(model.value, domain.state);
  assert.equal(model.context.receipt, domain.receiptKind);
  assert.equal(model.context.revision, domain.revision);
  assert.equal(domain.hasDispatchAuthority, true);
  assert.equal(domain.hasAdmissionAuthority, true);
});

test("arbitrary histories preserve revision, fencing and readiness invariants", () => {
  const eventArbitrary = fc.constantFrom(
    ...spec.events.map(({ type }) => Object.freeze({ type })),
  );
  fc.assert(
    fc.property(fc.array(eventArbitrary, { maxLength: 80 }), (events) => {
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
    { numRuns: 300 },
  );
});
