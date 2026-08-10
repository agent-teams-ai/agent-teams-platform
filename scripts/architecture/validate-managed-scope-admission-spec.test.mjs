import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateManagedScopeAdmissionDocument } from "./validate-managed-scope-admission-spec.mjs";

const document = JSON.parse(
  await readFile(
    new URL(
      "../../architecture/project-management/managed-scope-admission-process.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const schema = JSON.parse(
  await readFile(
    new URL(
      "../../architecture/project-management/managed-scope-admission-process.schema.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

test("accepts the canonical managed scope-admission specification", () => {
  assert.deepEqual(validateManagedScopeAdmissionDocument(document, schema), []);
});

test("rejects undeclared transition states after strict schema validation", () => {
  const invalid = structuredClone(document);
  invalid.events[0].to = "invented-state";
  assert.deepEqual(validateManagedScopeAdmissionDocument(invalid, schema), [
    "SCOPE-SPEC-EVENT-003 CLAIM has undeclared target invented-state",
  ]);
});

test("rejects an XState snapshot promoted to canonical storage", () => {
  const invalid = structuredClone(document);
  invalid.authority.canonicalStorage = "xstate-snapshot";
  assert.match(
    validateManagedScopeAdmissionDocument(invalid, schema).join("\n"),
    /canonicalStorage/u,
  );
});

test("rejects a cross-axis effect outside the declared authority axis", () => {
  const invalid = structuredClone(document);
  invalid.events[1].effects.set.authority = "invented-authority";
  assert.deepEqual(validateManagedScopeAdmissionDocument(invalid, schema), [
    "SCOPE-SPEC-EFFECT-001 AUTHORIZE_DISPATCH sets undeclared authority invented-authority",
  ]);
});

test("rejects a guard that compares against the wrong bounded axis", () => {
  const invalid = structuredClone(document);
  invalid.events[0].guard.all[0].limit = "generations";
  assert.deepEqual(validateManagedScopeAdmissionDocument(invalid, schema), [
    "SCOPE-SPEC-GUARD-001 CLAIM compares attemptCount with generations",
  ]);
});

test("rejects lifecycle effects that omit aggregate revision advance", () => {
  const invalid = structuredClone(document);
  invalid.events[0].effects.increment = ["attemptCount"];
  assert.deepEqual(validateManagedScopeAdmissionDocument(invalid, schema), [
    "SCOPE-SPEC-EFFECT-003 CLAIM changes lifecycle without revision",
  ]);
});

test("rejects receipt effects outside the JSON-owned vocabulary", () => {
  const invalid = structuredClone(document);
  invalid.events.find(({ type }) => type === "OBSERVE_REJECTED").effects.set.receipt =
    "invented";
  assert.deepEqual(validateManagedScopeAdmissionDocument(invalid, schema), [
    "SCOPE-SPEC-EFFECT-005 OBSERVE_REJECTED sets undeclared receipt invented",
  ]);
});

test("rejects block-reason guards outside the JSON-owned vocabulary", () => {
  const invalid = structuredClone(document);
  invalid.events
    .find(({ type }) => type === "RESUME_NEW_GENERATION")
    .guard.all.find(({ field }) => field === "blockReason")
    .values.push("INVENTED_REASON");
  assert.deepEqual(validateManagedScopeAdmissionDocument(invalid, schema), [
    "SCOPE-SPEC-GUARD-003 RESUME_NEW_GENERATION references an undeclared block reason",
  ]);
});
