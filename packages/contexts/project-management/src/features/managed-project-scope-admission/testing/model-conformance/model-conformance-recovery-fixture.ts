import { ids } from "../../domain/value-objects.js";
import {
  acceptedProject,
  cancelCommand,
  fixture,
  NOW,
  resumeCommand,
} from "./model-conformance-subject.js";
import {
  productionProcessProjection,
  requireProductionSnapshot,
} from "./model-conformance-freshness-fixture.js";

type RecoverableBlockReason =
  | "COMMERCIAL_RESTRICTION"
  | "DOWNSTREAM_STALE"
  | "SAFE_RETRY_EXHAUSTED"
  | "AUTHORITY_RECHECK_EXHAUSTED";

function allowedAuthority(suffix: string) {
  return {
    kind: "allowed" as const,
    evidenceRef: ids.authorityEvidence(`model-${suffix}`),
    revision: ids.authorityRevision(`model-${suffix}`),
    validUntil: NOW + 240_000,
  };
}

function allowEveryAuthority(
  subject: ReturnType<typeof fixture>,
  suffix: string,
) {
  subject.tenantAuthority.decision = allowedAuthority(`${suffix}-tenant`);
  subject.projectAuthority.decision = allowedAuthority(`${suffix}-project`);
  subject.commercialAuthority.decision = allowedAuthority(`${suffix}-commercial`);
  subject.preparationAuthority.decision = allowedAuthority(`${suffix}-control`);
}

async function blockedSubject(reason: RecoverableBlockReason) {
  if (reason === "COMMERCIAL_RESTRICTION") {
    const subject = fixture();
    const created = await acceptedProject(subject);
    subject.commercialAuthority.decision = {
      kind: "denied",
      reason: "COMMERCIAL_POLICY_DENIED",
    };
    await subject.worker.dispatchManagedScopeAdmission();
    return { subject, created };
  }
  if (reason === "DOWNSTREAM_STALE") {
    const subject = fixture();
    const created = await acceptedProject(subject);
    subject.orchestration.submission = (intent) => ({
      kind: "receipt",
      receipt: {
        kind: "stale",
        receiptRef: ids.orchestratorReceipt("model-blocked-stale"),
        receiptDigest: intent.commandDigest,
      },
    });
    await subject.worker.dispatchManagedScopeAdmission();
    return { subject, created };
  }
  if (reason === "SAFE_RETRY_EXHAUSTED") {
    const subject = fixture({
      safeRetryPolicy: { defaultDelayMs: 1000, maxDelayMs: 1000, maxAttempts: 1 },
    });
    const created = await acceptedProject(subject);
    subject.tenantAuthority.decision = {
      kind: "unavailable",
      reason: "TENANT_AUTHORITY_OFFLINE",
    };
    await subject.worker.dispatchManagedScopeAdmission();
    return { subject, created };
  }
  const subject = fixture({
    safeRetryPolicy: { defaultDelayMs: 1000, maxDelayMs: 1000, maxAttempts: 2 },
  });
  const created = await acceptedProject(subject);
  subject.store.injectBeforeReceiptLinearizationForTest(() => {
    subject.setNow(NOW + 60_000);
  });
  await subject.worker.dispatchManagedScopeAdmission();
  subject.tenantAuthority.decision = {
    kind: "unavailable",
    reason: "TENANT_AUTHORITY_OFFLINE",
  };
  await subject.worker.recheckScopeAdmissionAuthority();
  subject.setNow(NOW + 61_000);
  await subject.worker.recheckScopeAdmissionAuthority();
  return { subject, created };
}

async function postReceiptCommercialBlockedSubject() {
  const subject = fixture();
  const created = await acceptedProject(subject);
  subject.store.injectBeforeReceiptLinearizationForTest(() => {
    subject.setNow(NOW + 60_000);
  });
  await subject.worker.dispatchManagedScopeAdmission();
  subject.tenantAuthority.decision = allowedAuthority("commercial-recheck-tenant");
  subject.projectAuthority.decision = allowedAuthority("commercial-recheck-project");
  subject.commercialAuthority.decision = {
    kind: "denied",
    reason: "COMMERCIAL_POLICY_DENIED",
  };
  await subject.worker.recheckScopeAdmissionAuthority();
  return { subject, created };
}

async function postReceiptCommercialUnavailableSubject() {
  const subject = fixture({
    safeRetryPolicy: { defaultDelayMs: 1000, maxDelayMs: 1000, maxAttempts: 2 },
  });
  const created = await acceptedProject(subject);
  subject.store.injectBeforeReceiptLinearizationForTest(() => {
    subject.setNow(NOW + 60_000);
  });
  await subject.worker.dispatchManagedScopeAdmission();
  subject.tenantAuthority.decision = allowedAuthority("commercial-unavailable-tenant");
  subject.projectAuthority.decision = allowedAuthority("commercial-unavailable-project");
  subject.commercialAuthority.decision = {
    kind: "unavailable",
    reason: "COMMERCIAL_AUTHORITY_OFFLINE",
  };
  await subject.worker.recheckScopeAdmissionAuthority();
  subject.setNow(NOW + 61_000);
  await subject.worker.recheckScopeAdmissionAuthority();
  return { subject, created };
}

async function authorityDeniedSubject(afterReceipt: boolean) {
  const subject = fixture();
  const created = await acceptedProject(subject);
  if (afterReceipt) {
    subject.store.injectBeforeReceiptLinearizationForTest(() => {
      subject.setNow(NOW + 60_000);
    });
    await subject.worker.dispatchManagedScopeAdmission();
  }
  subject.tenantAuthority.decision = {
    kind: "denied",
    reason: "TENANT_ACCESS_REVOKED",
  };
  if (afterReceipt) {
    await subject.worker.recheckScopeAdmissionAuthority();
  } else {
    await subject.worker.dispatchManagedScopeAdmission();
  }
  subject.tenantAuthority.decision = allowedAuthority("authority-resume");
  return { subject, created };
}

async function reconciledAdmittedBlockedSubject(
  reason: "AUTHORITY_DENIED" | "COMMERCIAL_RESTRICTION",
) {
  const subject = fixture();
  const created = await acceptedProject(subject);
  subject.orchestration.submission = () => ({ kind: "outcome-unknown" });
  await subject.worker.dispatchManagedScopeAdmission();
  subject.orchestration.recovery = (intent) => ({
    kind: "receipt",
    receipt: {
      kind: "admitted",
      receiptRef: ids.orchestratorReceipt(`model-reconciled-${reason}`),
      receiptDigest: intent.commandDigest,
    },
  });
  if (reason === "AUTHORITY_DENIED") {
    subject.tenantAuthority.decision = {
      kind: "denied",
      reason: "TENANT_ACCESS_REVOKED",
    };
  } else {
    subject.commercialAuthority.decision = {
      kind: "denied",
      reason: "COMMERCIAL_POLICY_DENIED",
    };
  }
  await subject.worker.reconcileManagedScopeAdmission(created.operationRef);
  return { subject, created };
}

async function downstreamBlockedSubject(kind: "rejected" | "stale") {
  const subject = fixture();
  const created = await acceptedProject(subject);
  subject.orchestration.submission = (intent) => ({
    kind: "receipt",
    receipt: {
      kind,
      receiptRef: ids.orchestratorReceipt(`model-downstream-${kind}`),
      receiptDigest: intent.commandDigest,
    },
  });
  await subject.worker.dispatchManagedScopeAdmission();
  return { subject, created };
}

async function userCancelledSubject(
  receiptKind: null | "admitted" | "rejected" | "stale",
) {
  const subject = fixture();
  const created = await acceptedProject(subject);
  if (receiptKind === "admitted") {
    subject.store.injectBeforeReceiptLinearizationForTest(() => {
      subject.setNow(NOW + 60_000);
    });
    await subject.worker.dispatchManagedScopeAdmission();
  } else if (receiptKind !== null) {
    subject.orchestration.submission = (intent) => ({
      kind: "receipt",
      receipt: {
        kind: receiptKind,
        receiptRef: ids.orchestratorReceipt(`model-cancel-${receiptKind}`),
        receiptDigest: intent.commandDigest,
      },
    });
    await subject.worker.dispatchManagedScopeAdmission();
  }
  subject.preparationAuthority.decision = allowedAuthority("cancel-control");
  await subject.application.cancelProjectPreparation(
    cancelCommand(created.operationRef),
  );
  return { subject, created };
}

async function cancellationEvidence(
  reason: RecoverableBlockReason | "RETRY_WAIT",
) {
  if (reason === "RETRY_WAIT") {
    const subject = fixture({
      safeRetryPolicy: { defaultDelayMs: 1000, maxDelayMs: 1000, maxAttempts: 2 },
    });
    const created = await acceptedProject(subject);
    subject.tenantAuthority.decision = {
      kind: "unavailable",
      reason: "TENANT_AUTHORITY_OFFLINE",
    };
    await subject.worker.dispatchManagedScopeAdmission();
    const before = await requireProductionSnapshot(
      subject,
      created.operationRef,
      "Expected retry-wait before cancellation.",
    );
    const result = await subject.application.cancelProjectPreparation(
      cancelCommand(created.operationRef),
    );
    const after = await requireProductionSnapshot(
      subject,
      created.operationRef,
      "Expected retry-wait cancellation result.",
    );
    return { result, before, after };
  }
  const { subject, created } = await blockedSubject(reason);
  if (reason === "AUTHORITY_RECHECK_EXHAUSTED") {
    subject.tenantAuthority.decision = allowedAuthority("cancel-exhausted");
  }
  subject.preparationAuthority.decision = allowedAuthority("cancel-control");
  const before = await requireProductionSnapshot(
    subject,
    created.operationRef,
    `Expected ${reason} before cancellation.`,
  );
  const result = await subject.application.cancelProjectPreparation(
    cancelCommand(created.operationRef),
  );
  const after = await requireProductionSnapshot(
    subject,
    created.operationRef,
    `Expected ${reason} cancellation result.`,
  );
  return { result, before, after };
}

export async function productionRecoverableCancellationEvidence() {
  const evidence = [];
  const retry = await cancellationEvidence("RETRY_WAIT");
  evidence.push(Object.freeze({
    reason: "RETRY_WAIT",
    resultKind: retry.result.kind,
    before: productionProcessProjection(retry.before.process),
    after: productionProcessProjection(retry.after.process),
  }));
  const cases = [
    ["AUTHORITY_DENIED_PRE_DISPATCH", await authorityDeniedSubject(false)],
    ["AUTHORITY_DENIED_AFTER_RECEIPT", await authorityDeniedSubject(true)],
    ["AUTHORITY_DENIED_RECONCILED_ADMITTED", await reconciledAdmittedBlockedSubject("AUTHORITY_DENIED")],
    ["COMMERCIAL_RESTRICTION_PRE_DISPATCH", await blockedSubject("COMMERCIAL_RESTRICTION")],
    ["COMMERCIAL_RESTRICTION_AFTER_RECEIPT", await postReceiptCommercialBlockedSubject()],
    ["COMMERCIAL_RESTRICTION_AFTER_RECEIPT_UNAVAILABLE", await postReceiptCommercialUnavailableSubject()],
    ["COMMERCIAL_RESTRICTION_RECONCILED_ADMITTED", await reconciledAdmittedBlockedSubject("COMMERCIAL_RESTRICTION")],
    ["DOWNSTREAM_REJECTED", await downstreamBlockedSubject("rejected")],
    ["DOWNSTREAM_STALE", await downstreamBlockedSubject("stale")],
    ["SAFE_RETRY_EXHAUSTED", await blockedSubject("SAFE_RETRY_EXHAUSTED")],
    ["AUTHORITY_RECHECK_EXHAUSTED", await blockedSubject("AUTHORITY_RECHECK_EXHAUSTED")],
  ] as const;
  for (const [reason, value] of cases) {
    const { subject, created } = value;
    subject.preparationAuthority.decision = allowedAuthority("cancel-control");
    if (reason === "AUTHORITY_RECHECK_EXHAUSTED") {
      subject.tenantAuthority.decision = allowedAuthority("cancel-exhausted");
    }
    const before = await requireProductionSnapshot(
      subject,
      created.operationRef,
      `Expected ${reason} before cancellation.`,
    );
    const result = await subject.application.cancelProjectPreparation(
      cancelCommand(created.operationRef),
    );
    const after = await requireProductionSnapshot(
      subject,
      created.operationRef,
      `Expected ${reason} cancellation result.`,
    );
    evidence.push(Object.freeze({
      reason,
      resultKind: result.kind,
      before: productionProcessProjection(before.process),
      after: productionProcessProjection(after.process),
    }));
  }
  return Object.freeze(evidence);
}

export async function productionBlockedResumeEvidence() {
  const evidence = [];
  const cases = [
    ["AUTHORITY_DENIED_PRE_DISPATCH", await authorityDeniedSubject(false)],
    ["AUTHORITY_DENIED_AFTER_RECEIPT", await authorityDeniedSubject(true)],
    ["AUTHORITY_DENIED_RECONCILED_ADMITTED", await reconciledAdmittedBlockedSubject("AUTHORITY_DENIED")],
    ["COMMERCIAL_RESTRICTION_PRE_DISPATCH", await blockedSubject("COMMERCIAL_RESTRICTION")],
    ["COMMERCIAL_RESTRICTION_AFTER_RECEIPT", await postReceiptCommercialBlockedSubject()],
    ["COMMERCIAL_RESTRICTION_AFTER_RECEIPT_UNAVAILABLE", await postReceiptCommercialUnavailableSubject()],
    ["COMMERCIAL_RESTRICTION_RECONCILED_ADMITTED", await reconciledAdmittedBlockedSubject("COMMERCIAL_RESTRICTION")],
    ["USER_CANCELLED_NO_RECEIPT", await userCancelledSubject(null)],
    ["USER_CANCELLED_ADMITTED", await userCancelledSubject("admitted")],
    ["USER_CANCELLED_REJECTED", await userCancelledSubject("rejected")],
    ["USER_CANCELLED_STALE", await userCancelledSubject("stale")],
    ["SAFE_RETRY_EXHAUSTED", await blockedSubject("SAFE_RETRY_EXHAUSTED")],
    ["DOWNSTREAM_REJECTED", await downstreamBlockedSubject("rejected")],
    ["DOWNSTREAM_STALE", await downstreamBlockedSubject("stale")],
    ["AUTHORITY_RECHECK_EXHAUSTED", await blockedSubject("AUTHORITY_RECHECK_EXHAUSTED")],
  ] as const;
  for (const [source, value] of cases) {
    const { subject, created } = value;
    allowEveryAuthority(subject, "resume");
    const predecessor = await requireProductionSnapshot(
      subject,
      created.operationRef,
      `Expected ${source} predecessor before resume.`,
    );
    const countsBefore = subject.store.inspectCounts();
    const command = resumeCommand(created.operationRef);
    const first = await subject.application.resumeProjectPreparation(command);
    const replay = await subject.application.resumeProjectPreparation(command);
    const successor = await requireProductionSnapshot(
      subject,
      created.operationRef,
      `Expected ${source} successor after resume.`,
    );
    const countsAfter = subject.store.inspectCounts();
    evidence.push(Object.freeze({
      reason: source,
      first,
      replay,
      predecessor: productionProcessProjection(predecessor.process),
      successor: productionProcessProjection(successor.process),
      predecessorCommandId: predecessor.process.stepCommandId,
      successorCommandId: successor.process.stepCommandId,
      outboxesBefore: countsBefore.outboxes,
      outboxesAfter: countsAfter.outboxes,
    }));
  }
  return Object.freeze(evidence);
}

export async function productionReconciliationExhaustionEvidence() {
  const subject = fixture({
    safeRetryPolicy: { defaultDelayMs: 1000, maxDelayMs: 1000, maxAttempts: 2 },
  });
  const created = await acceptedProject(subject);
  subject.orchestration.submission = () => ({ kind: "outcome-unknown" });
  subject.orchestration.recovery = () => ({ kind: "known-not-accepted" });
  await subject.worker.dispatchManagedScopeAdmission();
  const firstResult = await subject.worker.reconcileManagedScopeAdmission(
    created.operationRef,
  );
  const first = await requireProductionSnapshot(
    subject,
    created.operationRef,
    "Expected first reconciliation retry.",
  );
  subject.setNow(NOW + 1000);
  await subject.worker.dispatchManagedScopeAdmission();
  const exhaustedResult = await subject.worker.reconcileManagedScopeAdmission(
    created.operationRef,
  );
  const exhausted = await requireProductionSnapshot(
    subject,
    created.operationRef,
    "Expected exhausted reconciliation result.",
  );
  return Object.freeze({
    firstResultKind: firstResult.kind,
    first: productionProcessProjection(first.process),
    exhaustedResultKind: exhaustedResult.kind,
    exhausted: productionProcessProjection(exhausted.process),
  });
}

export async function productionReconciledReceiptMatrixEvidence() {
  const evidence = [];
  const cases = [
    { label: "admitted", receiptKind: "admitted" },
    { label: "rejected", receiptKind: "rejected" },
    { label: "stale", receiptKind: "stale" },
    { label: "conflict", receiptKind: "conflict" },
    { label: "wrong-digest", receiptKind: "admitted" },
  ] as const;
  for (const { label, receiptKind } of cases) {
    const subject = fixture();
    const created = await acceptedProject(subject);
    subject.orchestration.submission = () => ({ kind: "outcome-unknown" });
    await subject.worker.dispatchManagedScopeAdmission();
    subject.orchestration.recovery = (intent) => ({
      kind: "receipt",
      receipt: {
        kind: receiptKind,
        receiptRef: ids.orchestratorReceipt(`model-recovered-${label}`),
        receiptDigest: label === "wrong-digest"
          ? ids.digest("model-recovered-wrong-digest")
          : intent.commandDigest,
      },
    });
    const result = await subject.worker.reconcileManagedScopeAdmission(
      created.operationRef,
    );
    const snapshot = await requireProductionSnapshot(
      subject,
      created.operationRef,
      `Expected recovered ${receiptKind} receipt.`,
    );
    evidence.push(Object.freeze({
      label,
      receiptKind,
      resultKind: result.kind,
      process: productionProcessProjection(snapshot.process),
    }));
  }
  return Object.freeze(evidence);
}

export async function productionCancellationRecoveryMatrixEvidence() {
  const evidence = [];
  const cases = [
    { label: "known-not-accepted", receiptKind: null },
    { label: "admitted", receiptKind: "admitted" },
    { label: "rejected", receiptKind: "rejected" },
    { label: "stale", receiptKind: "stale" },
    { label: "conflict", receiptKind: "conflict" },
    { label: "wrong-digest", receiptKind: "admitted" },
  ] as const;
  for (const { label, receiptKind } of cases) {
    const subject = fixture();
    const created = await acceptedProject(subject);
    subject.orchestration.submission = () => ({ kind: "outcome-unknown" });
    await subject.worker.dispatchManagedScopeAdmission();
    await subject.application.cancelProjectPreparation(
      cancelCommand(created.operationRef),
    );
    subject.orchestration.recovery = receiptKind === null
      ? () => ({ kind: "known-not-accepted" })
      : (intent) => ({
        kind: "receipt",
        receipt: {
          kind: receiptKind,
          receiptRef: ids.orchestratorReceipt(`model-cancel-recovered-${label}`),
          receiptDigest: label === "wrong-digest"
            ? ids.digest("model-cancel-recovered-wrong-digest")
            : intent.commandDigest,
        },
      });
    const result = await subject.worker.reconcileManagedScopeAdmission(
      created.operationRef,
    );
    const snapshot = await requireProductionSnapshot(
      subject,
      created.operationRef,
      `Expected cancellation recovery for ${receiptKind ?? "known-not-accepted"}.`,
    );
    evidence.push(Object.freeze({
      label,
      receiptKind,
      resultKind: result.kind,
      process: productionProcessProjection(snapshot.process),
    }));
  }
  return Object.freeze(evidence);
}
