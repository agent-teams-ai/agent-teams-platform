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
