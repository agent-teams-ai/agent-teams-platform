import assert from "node:assert/strict";
import test from "node:test";

import { domainTraces } from "./managed-scope-admission-domain-adapter.mjs";
import {
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
      mutant.limits.attempts += 1;
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
