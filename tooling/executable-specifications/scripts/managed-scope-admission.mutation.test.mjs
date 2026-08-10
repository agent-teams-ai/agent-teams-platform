import assert from "node:assert/strict";
import test from "node:test";

import { domainTraces } from "./managed-scope-admission-domain-adapter.mjs";
import {
  assertBlockedParity,
  assertCrossAxisInvariants,
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
    name: "premature reconciliation clear after lost acknowledgement",
    model: mutateEvent("LOSE_ACKNOWLEDGEMENT", (event) => {
      event.effects.set.reconciliation = "clear";
    }),
    witness: ["CLAIM", "AUTHORIZE_DISPATCH", "LOSE_ACKNOWLEDGEMENT"],
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
];

for (const mutant of mutants) {
  test(`kills ${mutant.name} mutant`, () => {
    const snapshot = runTrace(mutant.witness, mutant.model);
    assert.throws(() => mutant.oracle(snapshot), { name: "AssertionError" });
  });
}

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
