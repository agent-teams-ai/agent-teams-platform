import {
  acceptedProject,
  cancelCommand,
  fixture,
  resumeCommand,
} from "./test-fixture.js";

function processProjection(
  process: NonNullable<
    Awaited<ReturnType<ReturnType<typeof fixture>["store"]["loadByOperation"]>>
  >["process"],
) {
  return Object.freeze({
    state: process.state,
    generation: process.generation,
    revision: process.revision,
    attemptCount: process.attemptCount,
    resumptionCount: process.resumptionCount,
    receiptKind: process.receipt?.kind ?? null,
    blockReason: process.blockReason,
  });
}

export async function productionStaleGenerationEvidence() {
  const subject = fixture();
  const created = await acceptedProject(subject);
  await subject.application.cancelProjectPreparation(
    cancelCommand(created.operationRef),
  );
  await subject.application.resumeProjectPreparation(
    resumeCommand(created.operationRef),
  );
  const before = await subject.store.loadByOperation(created.operationRef);
  if (before === null) {
    throw new Error("Expected resumed process before stale command.");
  }
  const result = await subject.application.cancelProjectPreparation(
    cancelCommand(created.operationRef, 1, "model-stale-cancel"),
  );
  const after = await subject.store.loadByOperation(created.operationRef);
  if (after === null) {
    throw new Error("Expected resumed process after stale command.");
  }
  return Object.freeze({
    resultKind: result.kind,
    before: processProjection(before.process),
    after: processProjection(after.process),
  });
}
