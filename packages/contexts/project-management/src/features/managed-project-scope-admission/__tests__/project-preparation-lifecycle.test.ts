import assert from "node:assert/strict";
import test from "node:test";

import { ids } from "../composition.js";
import {
  NOW,
  acceptedProject,
  cancelCommand,
  fixture,
  readiness,
  resumeCommand,
} from "./test-fixture.js";

test("cancels before claim without any downstream side effect", async () => {
  const subject = fixture();
  const created = await acceptedProject(subject);
  const initialPreparationAuthority = subject.preparationAuthority.decision;
  assert.deepEqual(
    await subject.application.cancelProjectPreparation(cancelCommand(created.operationRef)),
    { kind: "cancelled", replayed: false },
  );
  subject.preparationAuthority.decision = {
    kind: "denied",
    reason: "PREPARATION_CONTROL_REVOKED",
  };
  assert.deepEqual(
    await subject.application.cancelProjectPreparation(cancelCommand(created.operationRef)),
    { kind: "cancelled", replayed: true },
  );
  subject.preparationAuthority.decision = initialPreparationAuthority;
  assert.equal(subject.orchestration.submissions.length, 0);
  assert.deepEqual(
    await readiness(subject, created.operationRef),
    {
      kind: "blocked",
      reason: "USER_CANCELLED",
      recoverable: true,
      allowedActions: ["resume", "inspect", "retire"],
    },
  );
});

test("fails closed for unauthorized and cross-tenant preparation access", async () => {
  const subject = fixture();
  const created = await acceptedProject(subject);
  assert.deepEqual(
    await subject.application.getScopeAdmissionReadiness({
      operationRef: created.operationRef,
      requesterRef: ids.requester("user-1"),
      tenantRef: ids.tenant("tenant-2"),
    }),
    { kind: "not-found" },
  );
  subject.preparationAuthority.decision = {
    kind: "denied",
    reason: "PREPARATION_CONTROL_DENIED",
  };
  assert.deepEqual(
    await subject.application.cancelProjectPreparation(cancelCommand(created.operationRef)),
    {
      kind: "denied",
      dependency: "project-preparation-authority",
      reason: "PREPARATION_CONTROL_DENIED",
    },
  );
  assert.equal(
    (await subject.store.loadByOperation(created.operationRef))?.process.state,
    "requested",
  );
});

test("rejects conflicting and stale lifecycle commands without mutating a successor", async () => {
  const subject = fixture();
  const created = await acceptedProject(subject);
  const acceptedCancel = cancelCommand(created.operationRef, 1, "lifecycle-command");
  assert.deepEqual(
    await subject.application.cancelProjectPreparation(acceptedCancel),
    { kind: "cancelled", replayed: false },
  );
  assert.deepEqual(
    await subject.application.cancelProjectPreparation({
      ...acceptedCancel,
      expectedGeneration: 2,
    }),
    { kind: "conflict", reason: "COMMAND_DIGEST_MISMATCH" },
  );
  assert.equal(
    (await subject.application.resumeProjectPreparation(
      resumeCommand(created.operationRef),
    )).kind,
    "accepted",
  );
  assert.deepEqual(
    await subject.application.cancelProjectPreparation(
      cancelCommand(created.operationRef, 1, "delayed-cancel"),
    ),
    { kind: "stale" },
  );
  assert.deepEqual(
    await subject.application.cancelProjectPreparation(
      cancelCommand(created.operationRef, 1, "delayed-cancel"),
    ),
    { kind: "stale" },
  );
  assert.equal(
    (await subject.store.loadByOperation(created.operationRef))?.process.generation,
    2,
  );
});

test("does not retain unbounded receipts for lifecycle commands with no side effect", async () => {
  const subject = fixture();
  const missing = ids.operation("missing-operation");
  for (let index = 0; index < 50; index += 1) {
    assert.deepEqual(
      await subject.application.cancelProjectPreparation(
        cancelCommand(missing, 1, `missing-cancel-${index}`),
      ),
      { kind: "not-found" },
    );
    assert.deepEqual(
      await subject.application.resumeProjectPreparation(
        resumeCommand(missing, 1, `missing-resume-${index}`),
      ),
      { kind: "not-found" },
    );
  }
  const created = await acceptedProject(subject);
  await subject.application.cancelProjectPreparation(cancelCommand(created.operationRef));
  for (let index = 0; index < 50; index += 1) {
    assert.deepEqual(
      await subject.application.cancelProjectPreparation(
        cancelCommand(created.operationRef, 1, `cancelled-no-op-${index}`),
      ),
      { kind: "cancelled", replayed: false },
    );
  }
  assert.equal(subject.store.inspectPreparationCommandReceiptCount(), 1);
});

test("replays an accepted resume without consulting changed authority", async () => {
  const subject = fixture();
  const created = await acceptedProject(subject);
  await subject.application.cancelProjectPreparation(cancelCommand(created.operationRef));
  const resume = resumeCommand(created.operationRef);
  const first = await subject.application.resumeProjectPreparation(resume);
  subject.tenantAuthority.decision = {
    kind: "denied",
    reason: "TENANT_ACCESS_REVOKED",
  };
  const callsBeforeReplay = subject.tenantAuthority.calls;
  assert.deepEqual(await subject.application.resumeProjectPreparation(resume), {
    ...(first.kind === "accepted" ? first : {}),
    replayed: true,
  });
  assert.equal(subject.tenantAuthority.calls, callsBeforeReplay);
});

test("does not reclassify a downstream conflict as a resumable cancellation", async () => {
  const subject = fixture();
  const created = await acceptedProject(subject);
  subject.orchestration.submission = (intent) => ({
    kind: "receipt",
    receipt: {
      kind: "conflict",
      receiptRef: ids.orchestratorReceipt("downstream-conflict"),
      receiptDigest: intent.commandDigest,
    },
  });
  assert.deepEqual(await subject.worker.dispatchManagedScopeAdmission(), {
    kind: "receipt-recorded",
  });
  assert.deepEqual(
    await subject.application.cancelProjectPreparation(cancelCommand(created.operationRef)),
    { kind: "already-completed", replayed: false },
  );
  assert.deepEqual(
    await subject.application.resumeProjectPreparation(resumeCommand(created.operationRef)),
    { kind: "not-resumable" },
  );
});

test("bounds retained process generations and outbox growth", async () => {
  const subject = fixture({ maxPreparationGenerations: 3 });
  const created = await acceptedProject(subject);
  for (const generation of [1, 2]) {
    await subject.application.cancelProjectPreparation(
      cancelCommand(created.operationRef, generation),
    );
    assert.equal(
      (await subject.application.resumeProjectPreparation(
        resumeCommand(created.operationRef, generation),
      )).kind,
      "accepted",
    );
  }
  await subject.application.cancelProjectPreparation(
    cancelCommand(created.operationRef, 3),
  );
  assert.deepEqual(
    await subject.application.resumeProjectPreparation(
      resumeCommand(created.operationRef, 3),
    ),
    { kind: "not-resumable" },
  );
  assert.equal(subject.store.inspectCounts().outboxes, 3);
});

test("cancellation wins a claimed but uncommitted dispatch CAS", async () => {
  const subject = fixture();
  const created = await acceptedProject(subject);
  const claim = await subject.store.claimPending({
    leaseId: ids.lease("cancel-wins"),
    now: NOW,
    leaseExpiresAt: NOW + 1000,
  });
  assert.ok(claim);
  assert.deepEqual(
    await subject.application.cancelProjectPreparation(cancelCommand(created.operationRef)),
    { kind: "cancelled", replayed: false },
  );
  assert.deepEqual(
    await subject.store.authorizeDispatch(
      claim,
      claim.process.creationAuthorityBasis,
    ),
    { kind: "stale" },
  );
});

test("cancellation reconciles an ambiguous dispatch before completing", async () => {
  const subject = fixture();
  const created = await acceptedProject(subject);
  subject.orchestration.submission = () => ({ kind: "outcome-unknown" });
  await subject.worker.dispatchManagedScopeAdmission();
  assert.deepEqual(
    await subject.application.cancelProjectPreparation(cancelCommand(created.operationRef)),
    { kind: "reconciliation-required", replayed: false },
  );
  subject.orchestration.recovery = () => ({ kind: "unresolved" });
  assert.deepEqual(
    await subject.worker.reconcileManagedScopeAdmission(created.operationRef),
    { kind: "unresolved" },
  );
  subject.orchestration.recovery = () => ({ kind: "known-not-accepted" });
  assert.deepEqual(
    await subject.worker.reconcileManagedScopeAdmission(created.operationRef),
    { kind: "cancelled" },
  );
  assert.deepEqual(
    await readiness(subject, created.operationRef),
    {
      kind: "blocked",
      reason: "USER_CANCELLED",
      recoverable: true,
      allowedActions: ["resume", "inspect", "retire"],
    },
  );
});

test("reports a reconciled downstream conflict as blocked, not cancelled", async () => {
  const subject = fixture();
  const created = await acceptedProject(subject);
  subject.orchestration.submission = () => ({ kind: "outcome-unknown" });
  await subject.worker.dispatchManagedScopeAdmission();
  await subject.application.cancelProjectPreparation(cancelCommand(created.operationRef));
  const target = await subject.store.loadReconciliationTarget(created.operationRef);
  assert.ok(target);
  subject.orchestration.recovery = () => ({
    kind: "receipt",
    receipt: {
      kind: "conflict",
      receiptRef: ids.orchestratorReceipt("cancel-conflict"),
      receiptDigest: target.process.stepDigest,
    },
  });
  assert.deepEqual(
    await subject.worker.reconcileManagedScopeAdmission(created.operationRef),
    { kind: "blocked" },
  );
  assert.deepEqual(await readiness(subject, created.operationRef), {
    kind: "blocked",
    reason: "DOWNSTREAM_CONFLICT",
    recoverable: false,
    allowedActions: ["inspect", "retire"],
  });
});

test("cancellation preserves a late admitted receipt while admission stays denied", async () => {
  const subject = fixture();
  const created = await acceptedProject(subject);
  subject.orchestration.submission = () => ({ kind: "outcome-unknown" });
  await subject.worker.dispatchManagedScopeAdmission();
  await subject.application.cancelProjectPreparation(cancelCommand(created.operationRef));
  const snapshot = await subject.store.loadByOperation(created.operationRef);
  assert.ok(snapshot);
  subject.orchestration.recovery = (intent) => ({
    kind: "receipt",
    receipt: {
      kind: "admitted",
      receiptRef: ids.orchestratorReceipt("late-cancelled-receipt"),
      receiptDigest: intent.commandDigest,
    },
  });
  assert.deepEqual(
    await subject.worker.reconcileManagedScopeAdmission(created.operationRef),
    { kind: "cancelled" },
  );
  const cancelled = await subject.store.loadByOperation(created.operationRef);
  assert.equal(cancelled?.admission.state, "denied");
  assert.equal(cancelled?.process.receipt?.kind, "admitted");
});

test("resume creates generation N+1 and never revives the predecessor claim", async () => {
  const subject = fixture();
  const created = await acceptedProject(subject);
  const predecessor = await subject.store.loadByOperation(created.operationRef);
  assert.ok(predecessor);
  await subject.application.cancelProjectPreparation(cancelCommand(created.operationRef));
  assert.deepEqual(
    await subject.application.resumeProjectPreparation(resumeCommand(created.operationRef)),
    {
      kind: "accepted",
      generation: 2,
      predecessorReceiptRetained: false,
      replayed: false,
    },
  );
  assert.deepEqual(await subject.worker.dispatchManagedScopeAdmission(), {
    kind: "receipt-recorded",
  });
  assert.notEqual(
    subject.orchestration.submissions[0]?.commandId,
    predecessor.process.stepCommandId,
  );
  const successor = await subject.store.loadByOperation(created.operationRef);
  assert.equal(successor?.process.generation, 2);
  assert.equal(successor?.admission.state, "allowed");
});

test("resume transfers future dispatch authority to the newly authorized requester", async () => {
  const subject = fixture();
  const created = await acceptedProject(subject);
  await subject.application.cancelProjectPreparation(cancelCommand(created.operationRef));
  assert.deepEqual(
    await subject.application.resumeProjectPreparation({
      ...resumeCommand(created.operationRef),
      commandScope: ids.commandScope("tenant-1:user-2"),
      requesterRef: ids.requester("user-2"),
    }),
    {
      kind: "accepted",
      generation: 2,
      predecessorReceiptRetained: false,
      replayed: false,
    },
  );
  assert.equal(
    (await subject.store.loadByOperation(created.operationRef))?.process.requesterRef,
    ids.requester("user-2"),
  );
});

test("a delayed predecessor receipt cannot mutate successor generation", async () => {
  const subject = fixture();
  const created = await acceptedProject(subject);
  subject.orchestration.submission = () => ({ kind: "outcome-unknown" });
  await subject.worker.dispatchManagedScopeAdmission();
  const predecessor = await subject.store.loadReconciliationTarget(
    created.operationRef,
  );
  assert.ok(predecessor);
  await subject.application.cancelProjectPreparation(cancelCommand(created.operationRef));
  subject.orchestration.recovery = () => ({ kind: "known-not-accepted" });
  await subject.worker.reconcileManagedScopeAdmission(created.operationRef);
  await subject.application.resumeProjectPreparation(resumeCommand(created.operationRef));
  assert.deepEqual(
    await subject.store.recordReconciledReceipt(
      predecessor,
      {
        kind: "admitted",
        receiptRef: ids.orchestratorReceipt("delayed-predecessor"),
        receiptDigest: predecessor.process.stepDigest,
      },
      {
        kind: "allow",
        basis: predecessor.process.creationAuthorityBasis,
      },
      NOW + 1000,
    ),
    { kind: "stale" },
  );
  const successor = await subject.store.loadByOperation(created.operationRef);
  assert.equal(successor?.process.generation, 2);
  assert.equal(successor?.admission.state, "denied");
  assert.notEqual(successor?.process.blockReason, "DATA_INTEGRITY_CONFLICT");
  assert.equal(
    subject.store.inspectGenerationEvidence(
      predecessor.process.id,
      predecessor.process.generation,
    )?.lateReceipt?.receiptRef,
    ids.orchestratorReceipt("delayed-predecessor"),
  );
});

test("resume rechecks an admitted receipt without creating a successor command", async () => {
  const subject = fixture({ maxPreparationGenerations: 1 });
  const created = await acceptedProject(subject);
  subject.orchestration.submission = (intent) => {
    subject.tenantAuthority.decision = {
      kind: "denied",
      reason: "TENANT_ACCESS_REVOKED",
    };
    return {
      kind: "receipt",
      receipt: {
        kind: "admitted",
        receiptRef: ids.orchestratorReceipt("adoptable-receipt"),
        receiptDigest: intent.commandDigest,
      },
    };
  };
  assert.deepEqual(await subject.worker.dispatchManagedScopeAdmission(), {
    kind: "receipt-recorded",
  });
  subject.tenantAuthority.decision = {
    kind: "allowed",
    evidenceRef: ids.authorityEvidence("restored-authority"),
    revision: ids.authorityRevision("restored-authority"),
    validUntil: NOW + 60_000,
  };
  assert.deepEqual(await readiness(subject, created.operationRef), {
    kind: "blocked",
    reason: "AUTHORITY_DENIED",
    recoverable: true,
    allowedActions: ["resume", "inspect", "retire"],
  });
  assert.deepEqual(
    await subject.application.resumeProjectPreparation(resumeCommand(created.operationRef)),
    {
      kind: "accepted",
      generation: 1,
      predecessorReceiptRetained: true,
      replayed: false,
    },
  );
  assert.deepEqual(
    await subject.worker.recheckScopeAdmissionAuthority(),
    { kind: "ready" },
  );
  assert.equal(subject.orchestration.submissions.length, 1);
  assert.equal(subject.orchestration.recoveries.length, 0);
  assert.deepEqual(
    await readiness(subject, created.operationRef),
    { kind: "ready" },
  );
});
