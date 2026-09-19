import assert from "node:assert/strict";

import { ids } from "../../../src/features/managed-project-scope-admission/composition.js";
import {
  type ModelConformanceSubject,
} from "../../../src/features/managed-project-scope-admission/testing/model-conformance/model-conformance-subject.js";

export {
  acceptedProject,
  cancelCommand,
  command,
  fixture,
  NOW,
  resumeCommand,
} from "../../../src/features/managed-project-scope-admission/testing/model-conformance/model-conformance-subject.js";

export async function readiness(
  subject: ModelConformanceSubject,
  operationRef: ReturnType<typeof ids.operation>,
) {
  const result = await subject.application.getScopeAdmissionReadiness({
    operationRef,
    requesterRef: ids.requester("user-1"),
    tenantRef: ids.tenant("tenant-1"),
  });
  assert.equal(result.kind, "found");
  if (result.kind !== "found") {
    throw new Error("Expected scope-admission readiness.");
  }
  return result.readiness;
}
