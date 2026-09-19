import {
  acceptedProject,
  cancelCommand,
  fixture,
  NOW,
  resumeCommand,
} from "./model-conformance-subject.js";
import { ids } from "../../domain/value-objects.js";
import { claimDispatch } from "../../domain/managed-scope-admission-process.js";
import { initialProcess } from "./model-conformance-base-fixture.js";

export function productionProcessProjection(
  process: NonNullable<
    Awaited<ReturnType<ReturnType<typeof fixture>["store"]["loadByOperation"]>>
  >["process"],
) {
  const authority = process.admissionAuthorityBasis !== null
    ? "admission-authorized"
    : process.state === "receipt-observed"
      ? "admission-recheck-pending"
      : process.state === "claimed"
        ? "dispatch-recheck-pending"
      : process.blockReason === "COMMERCIAL_RESTRICTION"
          ? "commercially-restricted"
          : process.blockReason === "AUTHORITY_DENIED"
            ? "denied"
            : process.state === "blocked"
              ? "closed"
              : process.dispatchAuthorityBasis !== null
                ? "dispatch-authorized"
                : "creation-authorized";
  const reconciliation = process.state === "reconcile-required"
    ? "outcome-unknown"
    : process.state === "cancel-reconcile-required"
      ? "cancellation-unknown"
      : "clear";
  return Object.freeze({
    state: process.state,
    authority,
    reconciliation,
    generation: process.generation,
    revision: process.revision,
    attemptCount: process.attemptCount,
    resumptionCount: process.resumptionCount,
    receiptKind: process.receipt?.kind ?? null,
    blockReason: process.blockReason,
    hasDispatchAuthority: process.dispatchAuthorityBasis !== null,
    hasAdmissionAuthority: process.admissionAuthorityBasis !== null,
  });
}

export function domainClaimedTrace() {
  return productionProcessProjection(claimDispatch(initialProcess()));
}

export async function requireProductionSnapshot(
  subject: ReturnType<typeof fixture>,
  operationRef: Awaited<ReturnType<typeof acceptedProject>>["operationRef"],
  message: string,
) {
  const snapshot = await subject.store.loadByOperation(operationRef);
  if (snapshot === null) {
    throw new Error(message);
  }
  return snapshot;
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
    before: productionProcessProjection(before.process),
    after: productionProcessProjection(after.process),
  });
}

export async function productionStaleRevisionEvidence() {
  const subject = fixture();
  const created = await acceptedProject(subject);
  subject.orchestration.submission = () => ({ kind: "outcome-unknown" });
  await subject.worker.dispatchManagedScopeAdmission();
  const target = await subject.store.loadReconciliationTarget(created.operationRef);
  if (target === null) {
    throw new Error("Expected a reconciliation target before advancing revision.");
  }
  await subject.application.cancelProjectPreparation(
    cancelCommand(created.operationRef),
  );
  const before = await requireProductionSnapshot(
    subject,
    created.operationRef,
    "Expected cancellation reconciliation before stale revision mutation.",
  );
  const result = await subject.store.recordKnownNotAccepted(target, {
    retryAt: NOW + 1000,
    exhausted: false,
  });
  const after = await requireProductionSnapshot(
    subject,
    created.operationRef,
    "Expected cancellation reconciliation after stale revision mutation.",
  );
  return Object.freeze({
    resultKind: result.kind,
    before: productionProcessProjection(before.process),
    after: productionProcessProjection(after.process),
  });
}

export async function productionReconciledAdmittedEvidence() {
  const subject = fixture();
  const created = await acceptedProject(subject);
  subject.orchestration.submission = () => ({ kind: "outcome-unknown" });
  await subject.worker.dispatchManagedScopeAdmission();
  subject.orchestration.recovery = (intent) => ({
    kind: "receipt",
    receipt: {
      kind: "admitted",
      receiptRef: ids.orchestratorReceipt("model-reconciled-admitted"),
      receiptDigest: intent.commandDigest,
    },
  });
  const result = await subject.worker.reconcileManagedScopeAdmission(
    created.operationRef,
  );
  const snapshot = await requireProductionSnapshot(
    subject,
    created.operationRef,
    "Expected reconciled admitted process.",
  );
  return Object.freeze({
    resultKind: result.kind,
    process: productionProcessProjection(snapshot.process),
  });
}

export async function productionDispatchCommittedCancellationEvidence() {
  const subject = fixture();
  const created = await acceptedProject(subject);
  const claim = await subject.store.claimPending({
    leaseId: ids.lease("model-cancellation-lease"),
    now: NOW,
    leaseExpiresAt: NOW + 60_000,
  });
  if (claim === null) {
    throw new Error("Expected a dispatch claim before cancellation.");
  }
  const authorized = await subject.store.authorizeDispatch(
    claim,
    claim.process.creationAuthorityBasis,
  );
  if (authorized.kind !== "authorized") {
    throw new Error("Expected dispatch authorization before cancellation.");
  }
  const result = await subject.application.cancelProjectPreparation(
    cancelCommand(created.operationRef),
  );
  const snapshot = await requireProductionSnapshot(
    subject,
    created.operationRef,
    "Expected dispatch-committed cancellation process.",
  );
  return Object.freeze({
    resultKind: result.kind,
    process: productionProcessProjection(snapshot.process),
  });
}

export async function productionIntegrityCancellationNoOpEvidence() {
  const subject = fixture();
  const created = await acceptedProject(subject);
  subject.orchestration.submission = (intent) => ({
    kind: "receipt",
    receipt: {
      kind: "admitted",
      receiptRef: ids.orchestratorReceipt("model-wrong-digest"),
      receiptDigest: ids.digest(`${intent.commandDigest}-wrong`),
    },
  });
  await subject.worker.dispatchManagedScopeAdmission();
  const before = await requireProductionSnapshot(
    subject,
    created.operationRef,
    "Expected integrity block before cancellation.",
  );
  const result = await subject.application.cancelProjectPreparation(
    cancelCommand(created.operationRef),
  );
  const after = await requireProductionSnapshot(
    subject,
    created.operationRef,
    "Expected integrity block after cancellation.",
  );
  return Object.freeze({
    resultKind: result.kind,
    before: productionProcessProjection(before.process),
    after: productionProcessProjection(after.process),
  });
}

async function cancellationNoOpEvidence(
  subject: ReturnType<typeof fixture>,
  operationRef: Awaited<ReturnType<typeof acceptedProject>>["operationRef"],
  commandId = "model-terminal-no-op",
) {
  const before = await requireProductionSnapshot(
    subject,
    operationRef,
    "Expected terminal process before cancellation no-op.",
  );
  const result = await subject.application.cancelProjectPreparation(
    cancelCommand(operationRef, 1, commandId),
  );
  const after = await requireProductionSnapshot(
    subject,
    operationRef,
    "Expected terminal process after cancellation no-op.",
  );
  return Object.freeze({
    resultKind: result.kind,
    before: productionProcessProjection(before.process),
    after: productionProcessProjection(after.process),
  });
}

export async function productionProtectedCancellationNoOpEvidence() {
  const readySubject = fixture();
  const ready = await acceptedProject(readySubject);
  await readySubject.worker.dispatchManagedScopeAdmission();

  const conflictSubject = fixture();
  const conflict = await acceptedProject(conflictSubject);
  conflictSubject.orchestration.submission = (intent) => ({
    kind: "receipt",
    receipt: {
      kind: "conflict",
      receiptRef: ids.orchestratorReceipt("model-terminal-conflict"),
      receiptDigest: intent.commandDigest,
    },
  });
  await conflictSubject.worker.dispatchManagedScopeAdmission();

  const cancelledSubject = fixture();
  const cancelled = await acceptedProject(cancelledSubject);
  await cancelledSubject.application.cancelProjectPreparation(
    cancelCommand(cancelled.operationRef),
  );

  return Object.freeze({
    ready: await cancellationNoOpEvidence(readySubject, ready.operationRef),
    downstreamConflict: await cancellationNoOpEvidence(
      conflictSubject,
      conflict.operationRef,
    ),
    userCancelled: await cancellationNoOpEvidence(
      cancelledSubject,
      cancelled.operationRef,
    ),
  });
}

export async function productionPendingCancellationNoOpEvidence() {
  const subject = fixture();
  const created = await acceptedProject(subject);
  subject.orchestration.submission = () => ({ kind: "outcome-unknown" });
  await subject.worker.dispatchManagedScopeAdmission();
  await subject.application.cancelProjectPreparation(
    cancelCommand(created.operationRef, 1, "model-first-uncertain-cancel"),
  );
  const before = await requireProductionSnapshot(
    subject,
    created.operationRef,
    "Expected pending cancellation reconciliation before repeat command.",
  );
  const result = await subject.application.cancelProjectPreparation(
    cancelCommand(created.operationRef, 1, "model-repeat-uncertain-cancel"),
  );
  const after = await requireProductionSnapshot(
    subject,
    created.operationRef,
    "Expected pending cancellation reconciliation after repeat command.",
  );
  return Object.freeze({
    resultKind: result.kind,
    before: productionProcessProjection(before.process),
    after: productionProcessProjection(after.process),
  });
}

export async function productionNonAdmittedResumeEvidence() {
  const evidence = [];
  for (const receiptKind of ["rejected", "stale"] as const) {
    const subject = fixture();
    const created = await acceptedProject(subject);
    subject.orchestration.submission = (intent) => ({
      kind: "receipt",
      receipt: {
        kind: receiptKind,
        receiptRef: ids.orchestratorReceipt(`model-resume-${receiptKind}`),
        receiptDigest: intent.commandDigest,
      },
    });
    await subject.worker.dispatchManagedScopeAdmission();
    const predecessor = await requireProductionSnapshot(
      subject,
      created.operationRef,
      `Expected ${receiptKind} predecessor before resume.`,
    );
    const command = resumeCommand(created.operationRef);
    const first = await subject.application.resumeProjectPreparation(command);
    const replay = await subject.application.resumeProjectPreparation(command);
    const successor = await requireProductionSnapshot(
      subject,
      created.operationRef,
      `Expected successor after ${receiptKind} resume.`,
    );
    evidence.push(Object.freeze({
      receiptKind,
      first,
      replay,
      predecessorCommandId: predecessor.process.stepCommandId,
      successorCommandId: successor.process.stepCommandId,
      successorReceiptKind: successor.process.receipt?.kind ?? null,
    }));
  }
  return Object.freeze(evidence);
}
