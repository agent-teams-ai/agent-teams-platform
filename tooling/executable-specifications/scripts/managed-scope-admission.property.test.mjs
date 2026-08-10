import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  array,
  assert as assertProperty,
  boolean,
  constantFrom,
  integer,
  property,
} from "fast-check";
import { createActor } from "xstate";

import { assertCrossAxisInvariants } from "./managed-scope-admission-invariants.mjs";
import { domainTraces } from "./managed-scope-admission-domain-adapter.mjs";
import {
  createManagedScopeAdmissionModel,
  eventAllows,
  runTrace,
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

function safeBoundary(limit, delta, minimum) {
  return Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.max(minimum, limit + delta),
  );
}

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
        if (current.context.generation !== previous.context.generation) {
          assert.equal(event.type, "RESUME_NEW_GENERATION");
        }
        if (current.context.resumptionCount !== previous.context.resumptionCount) {
          assert.ok(
            event.type === "RESUME_NEW_GENERATION" ||
              event.type === "RESUME_ADMITTED",
          );
        }
        if (current.context.attemptCount !== previous.context.attemptCount) {
          assert.ok(
            event.type === "CLAIM" ||
              event.type === "RESUME_NEW_GENERATION" ||
              event.type === "RESUME_ADMITTED",
          );
        }
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

test("arbitrary production policy bounds match model guard boundaries", () => {
  assertProperty(
    property(
      integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
      integer({ min: -1, max: 1 }),
      integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
      integer({ min: -1, max: 1 }),
      integer({ min: -1, max: 1 }),
      boolean(),
      (
        maxAttempts,
        attemptDelta,
        maxPreparationGenerations,
        generationDelta,
        resumptionDelta,
        retainsAdmittedReceipt,
      ) => {
        const attemptCount = safeBoundary(maxAttempts, attemptDelta, 0);
        const generation = safeBoundary(
          maxPreparationGenerations,
          generationDelta,
          1,
        );
        const resumptionCount = safeBoundary(
          maxPreparationGenerations,
          resumptionDelta,
          0,
        );
        const bounds = {
          attempts: maxAttempts,
          generations: maxPreparationGenerations,
        };
        const domain = domainTraces.policyBoundary({
          maxAttempts,
          attemptCount,
          maxPreparationGenerations,
          generation,
          resumptionCount,
          retainsAdmittedReceipt,
        });
        const attemptContext = {
          ...specification.initialContext,
          attemptCount,
        };
        for (const eventType of [
          "CLAIM",
          "RELEASE_RETRY",
          "RECONCILE_NOT_ACCEPTED",
        ]) {
          assert.equal(
            eventAllows(
              attemptContext,
              eventType,
              specification,
              bounds,
            ),
            !domain.attemptExhausted,
            `${eventType} must match safeRetryExhausted`,
          );
        }
        for (const eventType of [
          "RELEASE_EXHAUSTED",
          "RELEASE_COMMERCIAL_EXHAUSTED",
          "RECONCILE_NOT_ACCEPTED_EXHAUSTED",
        ]) {
          assert.equal(
            eventAllows(
              attemptContext,
              eventType,
              specification,
              bounds,
            ),
            domain.attemptExhausted,
            `${eventType} must match safeRetryExhausted`,
          );
        }

        const eventType = retainsAdmittedReceipt
          ? "RESUME_ADMITTED"
          : "RESUME_NEW_GENERATION";
        assert.equal(
          eventAllows(
            {
              ...specification.initialContext,
              blockReason: "USER_CANCELLED",
              generation,
              receipt: retainsAdmittedReceipt ? "admitted" : null,
              resumptionCount,
            },
            eventType,
            specification,
            bounds,
          ),
          !domain.generationExhausted,
        );
        if (retainsAdmittedReceipt) {
          assert.equal(
            eventAllows(
              {
                ...specification.initialContext,
                blockReason: "AUTHORITY_RECHECK_EXHAUSTED",
                generation,
                receipt: "admitted",
                resumptionCount,
              },
              "RESUME_ADMITTED",
              specification,
              bounds,
            ),
            !domain.generationExhausted,
          );
        }
      },
    ),
    { numRuns: 500, seed: 0x50afe },
  );
});

test("four-generation production fixture boundary is not the two-step witness bound", () => {
  const bounds = { attempts: 2, generations: 4 };
  for (const [generation, expectedAllowed] of [
    [3, true],
    [4, false],
  ]) {
    const context = {
      ...specification.initialContext,
      blockReason: "USER_CANCELLED",
      generation,
      receipt: null,
      resumptionCount: generation - 1,
    };
    assert.equal(
      eventAllows(
        context,
        "RESUME_NEW_GENERATION",
        specification,
        bounds,
      ),
      expectedAllowed,
    );
    assert.equal(
      !domainTraces.policyBoundary({
        maxAttempts: 2,
        attemptCount: 0,
        maxPreparationGenerations: 4,
        generation,
        resumptionCount: generation - 1,
        retainsAdmittedReceipt: false,
      }).generationExhausted,
      expectedAllowed,
    );
  }
});

test("authority-recheck exhaustion recovery matches every retained-receipt bound", () => {
  assertProperty(
    property(
      integer({ min: 1, max: 8 }),
      integer({ min: 0, max: 9 }),
      (maxPreparationGenerations, resumptionCount) => {
        const domain = domainTraces.policyBoundary({
          maxAttempts: 1,
          attemptCount: 0,
          maxPreparationGenerations,
          generation: 1,
          resumptionCount,
          retainsAdmittedReceipt: true,
        });
        assert.equal(
          eventAllows(
            {
              ...specification.initialContext,
              blockReason: "AUTHORITY_RECHECK_EXHAUSTED",
              receipt: "admitted",
              resumptionCount,
            },
            "RESUME_ADMITTED",
            specification,
            { attempts: 1, generations: maxPreparationGenerations },
          ),
          !domain.generationExhausted,
        );
      },
    ),
    { numRuns: 300, seed: 0xa0710 },
  );
});

test("critical error paths preserve their recovery contract under arbitrary suffixes", () => {
  const eventArbitrary = constantFrom(
    ...specification.events.map(({ type }) => type),
  );
  assertProperty(
    property(array(eventArbitrary, { maxLength: 40 }), (suffix) => {
      for (const traceName of [
        "primaryIntegrityConflict",
        "reconciliationIntegrityConflict",
        "cancellationIntegrityConflict",
        "integrityConflict",
      ]) {
        const integrity = runTrace([...traces[traceName], ...suffix]);
        assert.equal(integrity.value, "blocked");
        assert.equal(integrity.context.blockReason, "DATA_INTEGRITY_CONFLICT");
      }

      const actor = createActor(createManagedScopeAdmissionModel()).start();
      for (const type of traces.authorityRecheckExhausted) {
        actor.send({ type });
      }
      let leftExhausted = false;
      for (const type of suffix) {
        const before = actor.getSnapshot();
        actor.send({ type });
        const after = actor.getSnapshot();
        if (!leftExhausted && after.value !== before.value) {
          assert.equal(type, "RESUME_ADMITTED");
          assert.equal(after.value, "receipt-observed");
          leftExhausted = true;
        }
        assertCrossAxisInvariants(after);
      }
      actor.stop();
    }),
    { numRuns: 300, seed: 0xc1171ca1 },
  );
});
