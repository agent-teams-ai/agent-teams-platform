import {
  authorizeDispatch,
  blockDispatchForAuthority,
  blockScopeAdmissionForAuthority,
  blockScopeAdmissionForAuthorityRecheckExhaustion,
  claimDispatch,
  completeScopeAdmissionCancellation,
  finalizeScopeAdmission,
  observeScopeAdmissionReceipt,
  requestScopeAdmissionCancellation,
  releaseUnsubmittedDispatch,
  releaseReconciledNonAcceptance,
  requireReconciliation,
  resumeManagedScopeAdmission,
  type ScopeAdmissionBlockReason,
} from "../../domain/managed-scope-admission-process.js";
import { ids } from "../../domain/value-objects.js";
import { applyScopeAdmissionReceipt } from "../../application/apply-scope-admission-receipt.js";
import { denyProjectAdmission } from "../../domain/project-admission-authority.js";
import {
  authorityBasis,
  blockedTrace,
  initialProcess,
} from "./model-conformance-base-fixture.js";

import { command, fixture, NOW } from "./model-conformance-subject.js";

export function domainLostAckCancellationResumeTrace() {
  let process = claimDispatch(initialProcess());
  process = authorizeDispatch(process, authorityBasis);
  process = requireReconciliation(process);
  process = requestScopeAdmissionCancellation(process).process;
  process = completeScopeAdmissionCancellation(process, null);
  process = resumeManagedScopeAdmission(process, {
    creationAuthorityBasis: authorityBasis,
    requesterRef: ids.requester("model-requester-r1"),
    stepCommandId: ids.scopeCommand("model-command-g2"),
    stepDigest: ids.digest("model-digest-g2"),
  });
  return Object.freeze({
    state: process.state,
    authority: "creation-authorized",
    reconciliation: "clear",
    generation: process.generation,
    revision: process.revision,
    attemptCount: process.attemptCount,
    resumptionCount: process.resumptionCount,
    blockReason: process.blockReason,
    receiptKind: process.receipt?.kind ?? null,
    hasDispatchAuthority: process.dispatchAuthorityBasis !== null,
    hasAdmissionAuthority: process.admissionAuthorityBasis !== null,
  });
}

export function domainReadyTrace() {
  let process = claimDispatch(initialProcess());
  process = authorizeDispatch(process, authorityBasis);
  process = observeScopeAdmissionReceipt(process, {
    kind: "admitted",
    receiptRef: ids.orchestratorReceipt("model-admitted-g1"),
    receiptDigest: process.stepDigest,
  });
  process = finalizeScopeAdmission(process, authorityBasis);
  return Object.freeze({
    state: process.state,
    authority: "admission-authorized",
    reconciliation: "clear",
    generation: process.generation,
    attemptCount: process.attemptCount,
    resumptionCount: process.resumptionCount,
    blockReason: process.blockReason,
    receiptKind: process.receipt?.kind ?? null,
    revision: process.revision,
    hasDispatchAuthority: process.dispatchAuthorityBasis !== null,
    hasAdmissionAuthority: process.admissionAuthorityBasis !== null,
  });
}

export function domainResumedReadyTrace() {
  let process = claimDispatch(initialProcess());
  process = authorizeDispatch(process, authorityBasis);
  process = observeScopeAdmissionReceipt(process, {
    kind: "admitted",
    receiptRef: ids.orchestratorReceipt("model-admitted-g1"),
    receiptDigest: process.stepDigest,
  });
  process = blockScopeAdmissionForAuthority(process, "AUTHORITY_DENIED");
  process = resumeManagedScopeAdmission(process, {
    creationAuthorityBasis: authorityBasis,
    requesterRef: ids.requester("model-requester-r1"),
  });
  process = finalizeScopeAdmission(process, authorityBasis);
  return Object.freeze({
    state: process.state,
    authority: "admission-authorized",
    reconciliation: "clear",
    generation: process.generation,
    attemptCount: process.attemptCount,
    resumptionCount: process.resumptionCount,
    blockReason: process.blockReason,
    receiptKind: process.receipt?.kind ?? null,
    revision: process.revision,
    hasDispatchAuthority: process.dispatchAuthorityBasis !== null,
    hasAdmissionAuthority: process.admissionAuthorityBasis !== null,
  });
}

function authorityRecheckExhaustedProcess() {
  let process = claimDispatch(initialProcess());
  process = authorizeDispatch(process, authorityBasis);
  process = observeScopeAdmissionReceipt(process, {
    kind: "admitted",
    receiptRef: ids.orchestratorReceipt("model-authority-exhausted"),
    receiptDigest: process.stepDigest,
  });
  process = blockScopeAdmissionForAuthorityRecheckExhaustion(
    process,
    "AUTHORITY_RECHECK_EXHAUSTED",
  );
  return process;
}

export function domainAuthorityRecheckExhaustedTrace() {
  const process = authorityRecheckExhaustedProcess();
  return Object.freeze({
    state: process.state,
    authority: "closed",
    reconciliation: "clear",
    generation: process.generation,
    attemptCount: process.attemptCount,
    resumptionCount: process.resumptionCount,
    blockReason: process.blockReason,
    receiptKind: process.receipt?.kind ?? null,
    revision: process.revision,
    hasDispatchAuthority: process.dispatchAuthorityBasis !== null,
    hasAdmissionAuthority: process.admissionAuthorityBasis !== null,
  });
}

export function domainAuthorityRecheckRecoveryTrace() {
  let process = authorityRecheckExhaustedProcess();
  process = resumeManagedScopeAdmission(process, {
    creationAuthorityBasis: authorityBasis,
    requesterRef: ids.requester("model-authority-recovery"),
  });
  process = finalizeScopeAdmission(process, authorityBasis);
  return Object.freeze({
    state: process.state,
    authority: "admission-authorized",
    reconciliation: "clear",
    generation: process.generation,
    attemptCount: process.attemptCount,
    resumptionCount: process.resumptionCount,
    blockReason: process.blockReason,
    receiptKind: process.receipt?.kind ?? null,
    revision: process.revision,
    hasDispatchAuthority: process.dispatchAuthorityBasis !== null,
    hasAdmissionAuthority: process.admissionAuthorityBasis !== null,
  });
}

export function domainIntegrityConflictTrace() {
  let process = claimDispatch(initialProcess());
  process = authorizeDispatch(process, authorityBasis);
  process = observeScopeAdmissionReceipt(process, {
    kind: "admitted",
    receiptRef: ids.orchestratorReceipt("model-integrity-first"),
    receiptDigest: process.stepDigest,
  });
  process = observeScopeAdmissionReceipt(process, {
    kind: "rejected",
    receiptRef: ids.orchestratorReceipt("model-integrity-conflict"),
    receiptDigest: process.stepDigest,
  });
  return Object.freeze({
    state: process.state,
    authority: "closed",
    reconciliation: "clear",
    generation: process.generation,
    attemptCount: process.attemptCount,
    resumptionCount: process.resumptionCount,
    receiptKind: process.receipt?.kind ?? null,
    revision: process.revision,
    blockReason: process.blockReason,
    hasDispatchAuthority: process.dispatchAuthorityBasis !== null,
    hasAdmissionAuthority: process.admissionAuthorityBasis !== null,
  });
}

export function domainPrimaryIntegrityConflictTrace() {
  let process = claimDispatch(initialProcess());
  process = authorizeDispatch(process, authorityBasis);
  const transition = applyScopeAdmissionReceipt({
    process,
    admission: denyProjectAdmission(process.projectId),
    receipt: {
      kind: "admitted",
      receiptRef: ids.orchestratorReceipt("model-primary-wrong-digest"),
      receiptDigest: ids.digest("model-primary-wrong-digest"),
    },
    authority: { kind: "allow", basis: authorityBasis },
  });
  return blockedTrace(transition.process);
}

export function domainReconciliationIntegrityConflictTrace() {
  let process = claimDispatch(initialProcess());
  process = authorizeDispatch(process, authorityBasis);
  process = requireReconciliation(process);
  const transition = applyScopeAdmissionReceipt({
    process,
    admission: denyProjectAdmission(process.projectId),
    receipt: {
      kind: "admitted",
      receiptRef: ids.orchestratorReceipt("model-reconcile-wrong-digest"),
      receiptDigest: ids.digest("model-reconcile-wrong-digest"),
    },
    authority: { kind: "allow", basis: authorityBasis },
  });
  return blockedTrace(transition.process);
}

export function domainCancellationIntegrityConflictTrace() {
  let process = claimDispatch(initialProcess());
  process = authorizeDispatch(process, authorityBasis);
  process = requireReconciliation(process);
  process = requestScopeAdmissionCancellation(process).process;
  process = completeScopeAdmissionCancellation(process, {
    kind: "admitted",
    receiptRef: ids.orchestratorReceipt("model-cancel-integrity"),
    receiptDigest: ids.digest("model-wrong-cancel-digest"),
  });
  return blockedTrace(process);
}

export function domainPreDispatchCommercialRestrictionTrace() {
  const process = blockDispatchForAuthority(
    claimDispatch(initialProcess()),
    "COMMERCIAL_RESTRICTION",
  );
  return blockedTrace(process);
}

export function domainCommercialRetryExhaustedTrace() {
  let process = claimDispatch(initialProcess());
  process = releaseUnsubmittedDispatch(process, false);
  process = claimDispatch(process);
  process = releaseUnsubmittedDispatch(
    process,
    true,
    "COMMERCIAL_RESTRICTION",
  );
  return blockedTrace(process);
}

export function domainPreDispatchAuthorityDeniedTrace() {
  const process = blockDispatchForAuthority(
    claimDispatch(initialProcess()),
    "AUTHORITY_DENIED",
  );
  return blockedTrace(process);
}

function domainBlockedReceiptTrace(kind: "rejected" | "stale" | "conflict") {
  let process = claimDispatch(initialProcess());
  process = authorizeDispatch(process, authorityBasis);
  process = observeScopeAdmissionReceipt(process, {
    kind,
    receiptRef: ids.orchestratorReceipt(`model-${kind}`),
    receiptDigest: process.stepDigest,
  });
  return blockedTrace(process);
}

export function domainRejectedReceiptTrace() {
  return domainBlockedReceiptTrace("rejected");
}

export function domainStaleReceiptTrace() {
  return domainBlockedReceiptTrace("stale");
}

export function domainConflictReceiptTrace() {
  return domainBlockedReceiptTrace("conflict");
}

function domainReconciledBlockedReceiptTrace(
  kind: "rejected" | "stale" | "conflict",
) {
  let process = claimDispatch(initialProcess());
  process = authorizeDispatch(process, authorityBasis);
  process = requireReconciliation(process);
  process = observeScopeAdmissionReceipt(process, {
    kind,
    receiptRef: ids.orchestratorReceipt(`model-reconciled-${kind}`),
    receiptDigest: process.stepDigest,
  });
  return blockedTrace(process);
}

export function domainReconciledRejectedReceiptTrace() {
  return domainReconciledBlockedReceiptTrace("rejected");
}

export function domainReconciledStaleReceiptTrace() {
  return domainReconciledBlockedReceiptTrace("stale");
}

export function domainReconciledConflictReceiptTrace() {
  return domainReconciledBlockedReceiptTrace("conflict");
}

function domainBlockedReceiptResumeTrace(kind: "rejected" | "stale") {
  let process = claimDispatch(initialProcess());
  process = authorizeDispatch(process, authorityBasis);
  process = observeScopeAdmissionReceipt(process, {
    kind,
    receiptRef: ids.orchestratorReceipt(`model-resume-${kind}`),
    receiptDigest: process.stepDigest,
  });
  process = resumeManagedScopeAdmission(process, {
    creationAuthorityBasis: authorityBasis,
    requesterRef: ids.requester(`model-resume-${kind}`),
    stepCommandId: ids.scopeCommand(`model-resume-${kind}`),
    stepDigest: ids.digest(`model-resume-${kind}`),
  });
  return Object.freeze({
    state: process.state,
    authority: "creation-authorized",
    reconciliation: "clear",
    generation: process.generation,
    attemptCount: process.attemptCount,
    resumptionCount: process.resumptionCount,
    blockReason: process.blockReason,
    receiptKind: process.receipt?.kind ?? null,
    revision: process.revision,
    hasDispatchAuthority: process.dispatchAuthorityBasis !== null,
    hasAdmissionAuthority: process.admissionAuthorityBasis !== null,
  });
}

export function domainRejectedReceiptResumeTrace() {
  return domainBlockedReceiptResumeTrace("rejected");
}

export function domainStaleReceiptResumeTrace() {
  return domainBlockedReceiptResumeTrace("stale");
}

export function domainRetryExhaustedTrace() {
  let process = claimDispatch(initialProcess());
  process = releaseUnsubmittedDispatch(process, false);
  process = claimDispatch(process);
  process = releaseUnsubmittedDispatch(process, true);
  return blockedTrace(process);
}

export function domainDispatchCommittedRetryTrace() {
  let process = claimDispatch(initialProcess());
  process = authorizeDispatch(process, authorityBasis);
  process = releaseUnsubmittedDispatch(process, false);
  return Object.freeze({
    state: process.state,
    authority: "creation-authorized",
    reconciliation: "clear",
    generation: process.generation,
    attemptCount: process.attemptCount,
    resumptionCount: process.resumptionCount,
    blockReason: process.blockReason,
    receiptKind: process.receipt?.kind ?? null,
    revision: process.revision,
    hasDispatchAuthority: process.dispatchAuthorityBasis !== null,
    hasAdmissionAuthority: process.admissionAuthorityBasis !== null,
  });
}

export function domainDispatchCommittedRetryExhaustedTrace() {
  let process = claimDispatch(initialProcess());
  process = releaseUnsubmittedDispatch(process, false);
  process = claimDispatch(process);
  process = authorizeDispatch(process, authorityBasis);
  process = releaseUnsubmittedDispatch(process, true);
  return blockedTrace(process);
}

export function domainReconciliationRetryExhaustedTrace() {
  let process = claimDispatch(initialProcess());
  process = authorizeDispatch(process, authorityBasis);
  process = requireReconciliation(process);
  process = releaseReconciledNonAcceptance(process, false);
  process = claimDispatch(process);
  process = authorizeDispatch(process, authorityBasis);
  process = requireReconciliation(process);
  process = releaseReconciledNonAcceptance(process, true);
  return blockedTrace(process);
}

function domainAfterReceiptAuthorityTrace(
  reason: "AUTHORITY_DENIED" | "COMMERCIAL_RESTRICTION",
) {
  let process = claimDispatch(initialProcess());
  process = authorizeDispatch(process, authorityBasis);
  process = observeScopeAdmissionReceipt(process, {
    kind: "admitted",
    receiptRef: ids.orchestratorReceipt(`model-${reason}`),
    receiptDigest: process.stepDigest,
  });
  process = blockScopeAdmissionForAuthority(process, reason);
  return blockedTrace(process);
}

export function domainAfterReceiptAuthorityDeniedTrace() {
  return domainAfterReceiptAuthorityTrace("AUTHORITY_DENIED");
}

export function domainAfterReceiptCommercialRestrictionTrace() {
  return domainAfterReceiptAuthorityTrace("COMMERCIAL_RESTRICTION");
}

async function productionCommercialRouting(
  decision: "denied" | "unavailable",
  exhausted = true,
) {
  const subject = fixture({
    safeRetryPolicy: { defaultDelayMs: 1_000, maxDelayMs: 1_000, maxAttempts: 2 },
  });
  const creation = await subject.application.createProductProject(command());
  if (creation.kind !== "accepted") {
    throw new Error("Commercial routing fixture could not create its project.");
  }
  subject.commercialAuthority.decision = decision === "denied"
    ? { kind: "denied", reason: "MODEL_COMMERCIAL_DENIED" }
    : { kind: "unavailable", reason: "MODEL_COMMERCIAL_UNAVAILABLE" };
  if (decision === "unavailable" && exhausted) {
    const first = await subject.worker.dispatchManagedScopeAdmission();
    if (first.kind !== "retry") {
      throw new Error("Commercial routing fixture lost its first retry.");
    }
    subject.setNow(NOW + 1_000);
  }
  let observedReason: ScopeAdmissionBlockReason | null = null;
  let denialCalls = 0;
  let releaseCalls = 0;
  let releaseExhausted: boolean | null = null;
  const deny = subject.store.recordPreDispatchAuthorityDenied.bind(subject.store);
  subject.store.recordPreDispatchAuthorityDenied = async (claim, blockReason) => {
    denialCalls += 1;
    observedReason = blockReason;
    return deny(claim, blockReason);
  };
  const release = subject.store.releaseNotSubmitted.bind(subject.store);
  subject.store.releaseNotSubmitted = async (claim, input) => {
    releaseCalls += 1;
    releaseExhausted = input.exhausted;
    observedReason = input.exhaustedReason ?? "SAFE_RETRY_EXHAUSTED";
    return release(claim, input);
  };
  const result = await subject.worker.dispatchManagedScopeAdmission();
  if (subject.orchestration.submissions.length !== 0) {
    throw new Error("Commercial routing dispatched without authority.");
  }
  return Object.freeze({
    resultKind: result.kind,
    observedReason,
    denialCalls,
    releaseCalls,
    releaseExhausted,
  });
}

export async function productionCommercialDenialEvidence() {
  return productionCommercialRouting("denied");
}

export async function productionCommercialExhaustionEvidence() {
  return productionCommercialRouting("unavailable");
}

export async function productionCommercialRetryEvidence() {
  return productionCommercialRouting("unavailable", false);
}

export { domainPolicyBoundary } from "./model-conformance-policy-fixture.js";
export {
  domainAdmittedReceiptSafeCancellationTrace,
  domainBlockedAuthorityCancellationTrace,
  domainBlockedRejectedCancellationTrace,
  domainReconciledAdmittedCancellationTrace,
  domainReconciledCancellationTrace,
  domainReconciledConflictCancellationTrace,
  domainReconciledRejectedCancellationTrace,
  domainReconciledStaleCancellationTrace,
  domainSafeCancellationTrace,
} from "./model-conformance-cancellation-fixture.js";
export {
  domainClaimedTrace, productionDispatchCommittedCancellationEvidence,
  productionIntegrityCancellationNoOpEvidence,
  productionNonAdmittedResumeEvidence,
  productionPendingCancellationNoOpEvidence,
  productionProtectedCancellationNoOpEvidence,
  productionReconciledAdmittedEvidence,
  productionStaleGenerationEvidence,
  productionStaleRevisionEvidence,
} from "./model-conformance-freshness-fixture.js";
export { domainVocabularyEvidence } from "./model-conformance-vocabulary-fixture.js";
export {
  productionBlockedResumeEvidence, productionCancellationRecoveryMatrixEvidence,
  productionReconciliationExhaustionEvidence,
  productionReconciledReceiptMatrixEvidence,
  productionRecoverableCancellationEvidence,
} from "./model-conformance-recovery-fixture.js";
