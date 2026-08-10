import assert from "node:assert/strict";
import test from "node:test";

import {
  array,
  assert as assertProperty,
  constantFrom,
  property,
} from "fast-check";
import { createActor } from "xstate";

import { assertCrossAxisInvariants } from "./managed-scope-admission-invariants.mjs";
import {
  createManagedScopeAdmissionModel,
  specification,
} from "./managed-scope-admission-model.mjs";

test("arbitrary histories preserve revision, fencing and cross-axis invariants", () => {
  const eventArbitrary = constantFrom(
    ...specification.events.map(({ type }) => Object.freeze({ type })),
  );

  assertProperty(
    property(array(eventArbitrary, { maxLength: 80 }), (events) => {
      const actor = createActor(createManagedScopeAdmissionModel()).start();
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
