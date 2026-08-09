import assert from "node:assert/strict";
import test from "node:test";

import {
  type AuthorityDecision,
  ids,
  type ProjectManagementDependencies,
} from "../composition.js";
import {
  NOW,
  acceptedProject,
  command,
  fixture,
  readiness,
} from "./test-fixture.js";

test("commits Project, denied admission, receipt, process and outbox atomically", async () => {
  const subject = fixture();
  const result = await acceptedProject(subject);
  assert.deepEqual(subject.store.inspectCounts(), {
    projects: 1,
    admissions: 1,
    processes: 1,
    receipts: 1,
    outboxes: 1,
  });
  assert.deepEqual(
    await readiness(subject, result.operationRef),
    { kind: "preparing", reason: "DISPATCH_PENDING" },
  );
});

test("rolls back every injected creation failure without partial state", async (t) => {
  for (const point of [
    "project",
    "admission",
    "process",
    "receipt",
    "outbox",
  ] as const) {
    await t.test(point, async () => {
      const subject = fixture();
      subject.store.injectCreationFailure(point);
      await assert.rejects(
        subject.application.createProductProject(command()),
        new RegExp(`Injected creation failure at ${point}`, "u"),
      );
      assert.deepEqual(subject.store.inspectCounts(), {
        projects: 0,
        admissions: 0,
        processes: 0,
        receipts: 0,
        outboxes: 0,
      });
    });
  }
});

test("denied, unavailable and expired authority create no Project state", async (t) => {
  const cases: readonly AuthorityDecision[] = [
    { kind: "denied", reason: "NO_TENANT_ACCESS" },
    { kind: "unavailable", reason: "AUTHORITY_OFFLINE", retryAfter: NOW + 1000 },
    {
      kind: "allowed",
      evidenceRef: ids.authorityEvidence("expired"),
      revision: ids.authorityRevision("old"),
      validUntil: NOW,
    },
  ];
  for (const decision of cases) {
    await t.test(decision.kind, async () => {
      const subject = fixture();
      subject.tenantAuthority.decision = decision;
      const result = await subject.application.createProductProject(command());
      assert.notEqual(result.kind, "accepted");
      assert.equal(subject.store.inspectCounts().projects, 0);
    });
  }
});

test("maps an authority adapter failure to fail-closed unavailability", async () => {
  const subject = fixture();
  subject.projectAuthority.fails = true;
  assert.deepEqual(await subject.application.createProductProject(command()), {
    kind: "unavailable",
    dependency: "project-creation-authority",
    reason: "AUTHORITY_PORT_FAILURE",
  });
  assert.equal(subject.store.inspectCounts().projects, 0);
});

test("rejects authority evidence that expires while decisions are in flight", async () => {
  const subject = fixture();
  subject.tenantAuthority.afterDecision = () => {
    subject.setNow(NOW + 60_000);
  };
  assert.deepEqual(await subject.application.createProductProject(command()), {
    kind: "unavailable",
    dependency: "tenant-admission",
    reason: "AUTHORITY_EVIDENCE_EXPIRED",
  });
  assert.equal(subject.store.inspectCounts().projects, 0);
});

test("fails closed when authority expires at the creation linearization point", async () => {
  const subject = fixture();
  subject.store.injectBeforeCreationLinearizationForTest(() => {
    subject.setNow(NOW + 60_000);
  });
  assert.deepEqual(await subject.application.createProductProject(command()), {
    kind: "unavailable",
    dependency: "creation-authority-basis",
    reason: "AUTHORITY_EVIDENCE_EXPIRED",
  });
  assert.equal(subject.store.inspectCounts().projects, 0);
});

test("rejects retry policies that can spin or never terminate", () => {
  assert.throws(
    () => fixture({
      safeRetryPolicy: { defaultDelayMs: 0, maxDelayMs: 1000, maxAttempts: 2 },
    }),
    /retry delay/u,
  );
  assert.throws(
    () => fixture({
      safeRetryPolicy: { defaultDelayMs: 1000, maxDelayMs: 1000, maxAttempts: 0 },
    }),
    /retry attempts/u,
  );
  assert.throws(
    () => fixture({
      safeRetryPolicy: {
        defaultDelayMs: 1000,
        maxDelayMs: 999,
        maxAttempts: 2,
      },
    }),
    /maximum delay/u,
  );
  assert.throws(
    () => fixture({ dispatchLeaseDurationMs: Number.POSITIVE_INFINITY }),
    /lease duration/u,
  );
  assert.throws(
    () => fixture({ maxPreparationGenerations: 0 }),
    /preparation generations/u,
  );
});

test("owns versioned canonical digest preimages inside the application", async () => {
  const subject = fixture();
  const created = await acceptedProject(subject);
  const creationReceipt = await subject.store.loadCreationReceipt(
    ids.commandScope("tenant-1:user-1"),
    ids.createCommand("create-1"),
  );
  assert.equal(
    creationReceipt?.commandDigest,
    ids.digest(JSON.stringify([
      "agent-teams.platform.project-management.create-product-project.v1",
      "tenant-1:user-1",
      "create-1",
      "user-1",
      "tenant-1",
      "Alpha Project",
    ])),
  );
  const snapshot = await subject.store.loadByOperation(created.operationRef);
  assert.ok(snapshot);
  assert.equal(
    snapshot.process.stepDigest,
    ids.digest(JSON.stringify([
      "agent-teams.platform.project-management.admit-orchestration-scope.v1",
      snapshot.project.tenantRef,
      snapshot.project.id,
      snapshot.project.incarnation,
      snapshot.process.id,
      snapshot.process.generation,
      snapshot.process.stepCommandId,
    ])),
  );
});

test("bounds invalid remote retry hints", async () => {
  const subject = fixture();
  await acceptedProject(subject);
  subject.orchestration.submission = () => ({
    kind: "not-submitted",
    retryAfter: Number.POSITIVE_INFINITY,
  });
  assert.deepEqual(await subject.worker.dispatchManagedScopeAdmission(), {
    kind: "retry",
  });
  subject.setNow(NOW + 1000);
  assert.notDeepEqual(await subject.worker.dispatchManagedScopeAdmission(), {
    kind: "idle",
  });
});

test("replays exact duplicates and rejects conflicting command digests", async () => {
  const subject = fixture();
  const first = await subject.application.createProductProject(command());
  const replay = await subject.application.createProductProject(command());
  const conflict = await subject.application.createProductProject(
    command("Different display name"),
  );
  assert.equal(first.kind, "accepted");
  assert.deepEqual(replay, {
    ...(first.kind === "accepted" ? first : {}),
    replayed: true,
  });
  assert.deepEqual(conflict, {
    kind: "conflict",
    reason: "COMMAND_DIGEST_MISMATCH",
  });
  assert.equal(subject.store.inspectCounts().projects, 1);
});

test("replays an accepted command even after current authority is revoked", async () => {
  const subject = fixture();
  const first = await acceptedProject(subject);
  subject.tenantAuthority.decision = {
    kind: "denied",
    reason: "TENANT_ACCESS_REVOKED",
  };
  const callsBeforeReplay = subject.tenantAuthority.calls;
  assert.deepEqual(await subject.application.createProductProject(command()), {
    ...first,
    replayed: true,
  });
  assert.equal(subject.tenantAuthority.calls, callsBeforeReplay);
});

test("serializes concurrent duplicate commands into one Project", async () => {
  const subject = fixture();
  const results = await Promise.all(
    Array.from({ length: 20 }, () =>
      subject.application.createProductProject(command()),
    ),
  );
  assert.equal(results.filter((result) => result.kind === "accepted").length, 20);
  assert.equal(
    results.filter(
      (result) => result.kind === "accepted" && result.replayed === false,
    ).length,
    1,
  );
  assert.equal(subject.store.inspectCounts().projects, 1);
});

test("rejects durable identity reuse instead of overwriting prior state", async () => {
  const constantIds: ProjectManagementDependencies["ids"] = {
    nextProjectId: () => ids.project("project-fixed"),
    nextProcessId: () => ids.process("process-fixed"),
    nextOperationRef: () => ids.operation("operation-fixed"),
    nextScopeCommandId: () => ids.scopeCommand("scope-command-fixed"),
    nextOutboxId: () => ids.outbox("outbox-fixed"),
    nextLeaseId: () => ids.lease("lease-fixed"),
  };
  const subject = fixture({ idGenerator: constantIds });
  await acceptedProject(subject);
  await assert.rejects(
    subject.application.createProductProject(
      command("Second Project", "create-2"),
    ),
    /reuse a durable identity/u,
  );
  assert.equal(subject.store.inspectCounts().projects, 1);
});

test("uses an unambiguous idempotency namespace for arbitrary opaque IDs", async () => {
  const subject = fixture();
  const first = {
    ...command("First", "\u0000b"),
    commandScope: ids.commandScope("a"),
  };
  const second = {
    ...command("Second", "b"),
    commandScope: ids.commandScope("a\u0000"),
  };
  assert.equal((await subject.application.createProductProject(first)).kind, "accepted");
  assert.equal((await subject.application.createProductProject(second)).kind, "accepted");
  assert.equal(subject.store.inspectCounts().projects, 2);
});

test("records an admitted receipt and exposes READY without using it as command authority", async () => {
  const subject = fixture();
  const created = await acceptedProject(subject);
  assert.deepEqual(await subject.worker.dispatchManagedScopeAdmission(), {
    kind: "receipt-recorded",
  });
  assert.deepEqual(
    await readiness(subject, created.operationRef),
    { kind: "ready" },
  );
  assert.equal(subject.orchestration.submissions.length, 1);
  assert.equal(
    subject.orchestration.submissions[0]?.dispatchAuthority.validUntil,
    NOW + 60_000,
  );
  assert.equal(
    subject.orchestration.submissions[0]?.dispatchLease.validUntil,
    NOW + 1000,
  );
});

test("reconciles a lost acknowledgement by the original command identity", async () => {
  const subject = fixture();
  const created = await acceptedProject(subject);
  subject.orchestration.submission = () => ({ kind: "outcome-unknown" });
  assert.deepEqual(await subject.worker.dispatchManagedScopeAdmission(), {
    kind: "reconcile-required",
  });
  const original = subject.orchestration.submissions[0];
  assert.ok(original);
  subject.orchestration.recovery = (query) => ({
    kind: "receipt",
    receipt: {
      kind: "admitted",
      receiptRef: ids.orchestratorReceipt("recovered-receipt"),
      receiptDigest: query.commandDigest,
    },
  });
  assert.deepEqual(
    await subject.worker.reconcileManagedScopeAdmission(created.operationRef),
    { kind: "receipt-recorded" },
  );
  assert.equal(subject.orchestration.recoveries[0]?.commandId, original.commandId);
  assert.equal(
    subject.orchestration.recoveries[0]?.commandDigest,
    original.commandDigest,
  );
  assert.deepEqual(
    await readiness(subject, created.operationRef),
    { kind: "ready" },
  );
});

test("does not open admission when authority expires inside reconciliation", async () => {
  const subject = fixture();
  const created = await acceptedProject(subject);
  subject.orchestration.submission = () => ({ kind: "outcome-unknown" });
  assert.deepEqual(await subject.worker.dispatchManagedScopeAdmission(), {
    kind: "reconcile-required",
  });
  subject.orchestration.recovery = (intent) => ({
    kind: "receipt",
    receipt: {
      kind: "admitted",
      receiptRef: ids.orchestratorReceipt("reconciled-after-expiry"),
      receiptDigest: intent.commandDigest,
    },
  });
  subject.store.injectBeforeReceiptLinearizationForTest(() => {
    subject.setNow(NOW + 60_000);
  });
  assert.deepEqual(
    await subject.worker.reconcileManagedScopeAdmission(created.operationRef),
    { kind: "receipt-recorded" },
  );
  subject.preparationAuthority.decision = {
    kind: "allowed",
    evidenceRef: ids.authorityEvidence("read-reconciliation-recheck"),
    revision: ids.authorityRevision("read-reconciliation-recheck"),
    validUntil: NOW + 120_000,
  };
  assert.deepEqual(await readiness(subject, created.operationRef), {
    kind: "preparing",
    reason: "AUTHORITY_RECHECK_PENDING",
  });
});

test("retries the same command only after reconciliation proves non-acceptance", async () => {
  const subject = fixture();
  const created = await acceptedProject(subject);
  subject.orchestration.submission = () => ({ kind: "outcome-unknown" });
  assert.deepEqual(await subject.worker.dispatchManagedScopeAdmission(), {
    kind: "reconcile-required",
  });
  const original = subject.orchestration.submissions[0];
  assert.ok(original);
  subject.orchestration.recovery = () => ({
    kind: "known-not-accepted",
    retryAfter: NOW + 5000,
  });
  assert.deepEqual(
    await subject.worker.reconcileManagedScopeAdmission(created.operationRef),
    { kind: "retry" },
  );
  assert.deepEqual(await subject.worker.dispatchManagedScopeAdmission(), {
    kind: "idle",
  });
  subject.setNow(NOW + 5000);
  subject.orchestration.submission = (intent) => ({
    kind: "receipt",
    receipt: {
      kind: "admitted",
      receiptRef: ids.orchestratorReceipt("after-proven-non-acceptance"),
      receiptDigest: intent.commandDigest,
    },
  });
  assert.deepEqual(await subject.worker.dispatchManagedScopeAdmission(), {
    kind: "receipt-recorded",
  });
  assert.equal(subject.orchestration.submissions[1]?.commandId, original.commandId);
  assert.equal(
    subject.orchestration.submissions[1]?.commandDigest,
    original.commandDigest,
  );
});

test("treats an exception after dispatch claim as an ambiguous outcome", async () => {
  const subject = fixture();
  const created = await acceptedProject(subject);
  subject.orchestration.submission = () => {
    throw new Error("transport timeout");
  };
  assert.deepEqual(await subject.worker.dispatchManagedScopeAdmission(), {
    kind: "reconcile-required",
  });
  assert.deepEqual(
    await readiness(subject, created.operationRef),
    { kind: "preparing", reason: "OUTCOME_UNKNOWN" },
  );
});

test("retries only a proven not-submitted dispatch with the same semantic command", async () => {
  const subject = fixture();
  await acceptedProject(subject);
  subject.orchestration.submission = () => ({ kind: "not-submitted" });
  assert.deepEqual(await subject.worker.dispatchManagedScopeAdmission(), {
    kind: "retry",
  });
  assert.deepEqual(await subject.worker.dispatchManagedScopeAdmission(), {
    kind: "idle",
  });
  subject.setNow(NOW + 1000);
  assert.deepEqual(await subject.worker.dispatchManagedScopeAdmission(), {
    kind: "blocked",
  });
  assert.equal(subject.orchestration.submissions.length, 2);
  assert.equal(
    subject.orchestration.submissions[0]?.commandId,
    subject.orchestration.submissions[1]?.commandId,
  );
  assert.equal(
    subject.orchestration.submissions[0]?.commandDigest,
    subject.orchestration.submissions[1]?.commandDigest,
  );
  assert.deepEqual(await subject.worker.dispatchManagedScopeAdmission(), {
    kind: "idle",
  });
  assert.equal(subject.orchestration.submissions.length, 2);
});

test("safely requeues an expired claim that never committed a dispatch", async () => {
  const subject = fixture();
  const created = await acceptedProject(subject);
  await subject.store.claimPending({
    leaseId: ids.lease("crashed-worker-lease"),
    now: NOW,
    leaseExpiresAt: NOW + 1000,
  });
  subject.setNow(NOW + 1001);
  assert.deepEqual(await subject.worker.dispatchManagedScopeAdmission(), {
    kind: "receipt-recorded",
  });
  assert.equal(subject.orchestration.submissions.length, 1);
  assert.deepEqual(
    await readiness(subject, created.operationRef),
    { kind: "ready" },
  );
});

test("rejects an expired dispatch lease at the authorization CAS", async () => {
  const subject = fixture();
  await acceptedProject(subject);
  const claim = await subject.store.claimPending({
    leaseId: ids.lease("expired-before-authority"),
    now: NOW,
    leaseExpiresAt: NOW + 1000,
  });
  assert.ok(claim);
  subject.setNow(NOW + 1000);
  assert.deepEqual(
    await subject.store.authorizeDispatch(
      claim,
      claim.process.creationAuthorityBasis,
    ),
    { kind: "stale" },
  );
});

test("rejects authority that expires at the dispatch authorization CAS", async () => {
  const subject = fixture();
  await acceptedProject(subject);
  const claim = await subject.store.claimPending({
    leaseId: ids.lease("authority-expires-before-cas"),
    now: NOW,
    leaseExpiresAt: NOW + 120_000,
  });
  assert.ok(claim);
  subject.setNow(NOW + 60_000);
  assert.deepEqual(
    await subject.store.authorizeDispatch(
      claim,
      claim.process.creationAuthorityBasis,
    ),
    { kind: "stale" },
  );
});

test("does not submit after the dispatch lease expires past authorization", async () => {
  const subject = fixture();
  const created = await acceptedProject(subject);
  subject.store.injectAfterDispatchAuthorizationForTest(() => {
    subject.setNow(NOW + 1000);
  });
  assert.deepEqual(await subject.worker.dispatchManagedScopeAdmission(), {
    kind: "stale",
  });
  assert.equal(subject.orchestration.submissions.length, 0);
  subject.store.injectAfterDispatchAuthorizationForTest(null);
  assert.deepEqual(await subject.worker.dispatchManagedScopeAdmission(), {
    kind: "idle",
  });
  assert.deepEqual(
    await readiness(subject, created.operationRef),
    { kind: "preparing", reason: "OUTCOME_UNKNOWN" },
  );
});

test("reconciles an expired claim after dispatch authority was committed", async () => {
  const subject = fixture();
  const created = await acceptedProject(subject);
  const claim = await subject.store.claimPending({
    leaseId: ids.lease("committed-worker-lease"),
    now: NOW,
    leaseExpiresAt: NOW + 1000,
  });
  assert.ok(claim);
  await subject.store.authorizeDispatch(
    claim,
    claim.process.creationAuthorityBasis,
  );
  subject.setNow(NOW + 1001);
  assert.deepEqual(await subject.worker.dispatchManagedScopeAdmission(), {
    kind: "idle",
  });
  assert.equal(subject.orchestration.submissions.length, 0);
  assert.deepEqual(
    await readiness(subject, created.operationRef),
    { kind: "preparing", reason: "OUTCOME_UNKNOWN" },
  );
});

test("does not submit until last-mile authority is available", async () => {
  const subject = fixture();
  const created = await acceptedProject(subject);
  subject.tenantAuthority.decision = {
    kind: "unavailable",
    reason: "AUTHORITY_OFFLINE",
  };
  assert.deepEqual(await subject.worker.dispatchManagedScopeAdmission(), {
    kind: "retry",
  });
  assert.equal(subject.orchestration.submissions.length, 0);
  assert.deepEqual(
    await readiness(subject, created.operationRef),
    { kind: "preparing", reason: "RETRY_WAIT" },
  );
  subject.tenantAuthority.decision = {
    kind: "allowed",
    evidenceRef: ids.authorityEvidence("fresh"),
    revision: ids.authorityRevision("fresh"),
    validUntil: NOW + 60_000,
  };
  subject.setNow(NOW + 1000);
  assert.deepEqual(
    await subject.worker.dispatchManagedScopeAdmission(),
    { kind: "receipt-recorded" },
  );
  assert.equal(subject.orchestration.submissions.length, 1);
  assert.deepEqual(
    await readiness(subject, created.operationRef),
    { kind: "ready" },
  );
});

test("bounds unavailable authority retries and preserves commercial restriction semantics", async () => {
  const subject = fixture({
    safeRetryPolicy: { defaultDelayMs: 1000, maxDelayMs: 1000, maxAttempts: 2 },
  });
  const created = await acceptedProject(subject);
  subject.commercialAuthority.decision = {
    kind: "unavailable",
    reason: "COMMERCIAL_AUTHORITY_OFFLINE",
  };
  assert.deepEqual(await subject.worker.dispatchManagedScopeAdmission(), {
    kind: "retry",
  });
  subject.setNow(NOW + 1000);
  assert.deepEqual(await subject.worker.dispatchManagedScopeAdmission(), {
    kind: "blocked",
  });
  assert.equal(subject.orchestration.submissions.length, 0);
  assert.deepEqual(await readiness(subject, created.operationRef), {
    kind: "blocked",
    reason: "COMMERCIAL_RESTRICTION",
    recoverable: true,
    allowedActions: ["resume", "inspect", "retire"],
  });
});

test("rejects a receipt when Project revision changes during dispatch", async () => {
  const subject = fixture();
  const created = await acceptedProject(subject);
  subject.orchestration.submission = async (intent) => {
    await subject.store.advanceProjectRevisionForTest(created.operationRef);
    return {
      kind: "receipt",
      receipt: {
        kind: "admitted",
        receiptRef: ids.orchestratorReceipt("stale-project-receipt"),
        receiptDigest: intent.commandDigest,
      },
    };
  };
  assert.deepEqual(await subject.worker.dispatchManagedScopeAdmission(), {
    kind: "stale",
  });
  assert.notDeepEqual(
    await readiness(subject, created.operationRef),
    { kind: "ready" },
  );
});

test("blocks conflicting receipt evidence without opening admission", async () => {
  const subject = fixture();
  const created = await acceptedProject(subject);
  subject.orchestration.submission = () => ({
    kind: "receipt",
    receipt: {
      kind: "admitted",
      receiptRef: ids.orchestratorReceipt("receipt-with-wrong-digest"),
      receiptDigest: ids.digest("wrong-digest"),
    },
  });
  assert.deepEqual(await subject.worker.dispatchManagedScopeAdmission(), {
    kind: "integrity-conflict",
  });
  assert.deepEqual(
    await readiness(subject, created.operationRef),
    {
      kind: "blocked",
      reason: "DATA_INTEGRITY_CONFLICT",
      recoverable: false,
      allowedActions: ["inspect", "retire"],
    },
  );
});

test("does not open admission when authority expires inside receipt transaction", async () => {
  const subject = fixture();
  const created = await acceptedProject(subject);
  subject.store.injectBeforeReceiptLinearizationForTest(() => {
    subject.setNow(NOW + 60_000);
  });
  assert.deepEqual(await subject.worker.dispatchManagedScopeAdmission(), {
    kind: "receipt-recorded",
  });
  subject.preparationAuthority.decision = {
    kind: "allowed",
    evidenceRef: ids.authorityEvidence("read-recheck-state"),
    revision: ids.authorityRevision("read-recheck-state"),
    validUntil: NOW + 120_000,
  };
  assert.deepEqual(
    await readiness(subject, created.operationRef),
    { kind: "preparing", reason: "AUTHORITY_RECHECK_PENDING" },
  );
  subject.tenantAuthority.decision = {
    kind: "allowed",
    evidenceRef: ids.authorityEvidence("recheck-fresh"),
    revision: ids.authorityRevision("recheck-fresh"),
    validUntil: NOW + 120_000,
  };
  subject.projectAuthority.decision = subject.tenantAuthority.decision;
  subject.commercialAuthority.decision = subject.tenantAuthority.decision;
  subject.preparationAuthority.decision = subject.tenantAuthority.decision;
  assert.deepEqual(await subject.worker.recheckScopeAdmissionAuthority(), {
    kind: "ready",
  });
  assert.deepEqual(
    await readiness(subject, created.operationRef),
    { kind: "ready" },
  );
});

test("blocks authority recheck after the bounded retry horizon", async () => {
  const subject = fixture({
    safeRetryPolicy: { defaultDelayMs: 1000, maxDelayMs: 1000, maxAttempts: 2 },
  });
  const created = await acceptedProject(subject);
  subject.store.injectBeforeReceiptLinearizationForTest(() => {
    subject.setNow(NOW + 60_000);
  });
  assert.deepEqual(await subject.worker.dispatchManagedScopeAdmission(), {
    kind: "receipt-recorded",
  });
  subject.preparationAuthority.decision = {
    kind: "allowed",
    evidenceRef: ids.authorityEvidence("read-exhausted-recheck"),
    revision: ids.authorityRevision("read-exhausted-recheck"),
    validUntil: NOW + 180_000,
  };
  subject.tenantAuthority.decision = {
    kind: "unavailable",
    reason: "AUTHORITY_OFFLINE",
  };
  assert.deepEqual(await subject.worker.recheckScopeAdmissionAuthority(), {
    kind: "retry",
  });
  assert.deepEqual(
    await subject.worker.reconcileManagedScopeAdmission(created.operationRef),
    { kind: "not-found" },
  );
  subject.setNow(NOW + 61_000);
  assert.deepEqual(await subject.worker.recheckScopeAdmissionAuthority(), {
    kind: "blocked",
  });
  assert.deepEqual(await readiness(subject, created.operationRef), {
    kind: "blocked",
    reason: "AUTHORITY_RECHECK_EXHAUSTED",
    recoverable: true,
    allowedActions: ["resume", "inspect", "retire"],
  });
});
