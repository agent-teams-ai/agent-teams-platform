import type { CreationAuthorityBasisSnapshot } from "../domain/creation-authority-basis.js";
import {
  authorizeDispatch,
  blockDispatchForAuthority,
  blockScopeAdmissionForAuthority,
  blockScopeAdmissionForAuthorityRecheckExhaustion,
  blockScopeAdmissionForIntegrity,
  claimDispatch,
  completeScopeAdmissionCancellation,
  finalizeScopeAdmission,
  observeScopeAdmissionReceipt,
  requestManagedScopeAdmission,
  requestScopeAdmissionCancellation,
  releaseUnsubmittedDispatch,
  requireReconciliation,
  resumeManagedScopeAdmission,
} from "../domain/managed-scope-admission-process.js";
import { preparationGenerationExhausted } from "../domain/scope-admission-readiness.js";
import { ids } from "../domain/value-objects.js";
import { safeRetryExhausted } from "../application/safe-retry-policy.js";

const authorityBasis: CreationAuthorityBasisSnapshot = Object.freeze({
  checkedAt: 1_800_000_000_000,
  validUntil: 1_800_000_060_000,
  evidence: Object.freeze([
    Object.freeze({
      source: "tenant-admission",
      evidenceRef: ids.authorityEvidence("model-tenant"),
      revision: ids.authorityRevision("model-tenant-r1"),
      validUntil: 1_800_000_060_000,
    }),
    Object.freeze({
      source: "project-creation-authority",
      evidenceRef: ids.authorityEvidence("model-project"),
      revision: ids.authorityRevision("model-project-r1"),
      validUntil: 1_800_000_060_000,
    }),
    Object.freeze({
      source: "commercial-project-creation",
      evidenceRef: ids.authorityEvidence("model-commercial"),
      revision: ids.authorityRevision("model-commercial-r1"),
      validUntil: 1_800_000_060_000,
    }),
  ] as const),
});

function initialProcess() {
  return requestManagedScopeAdmission({
    id: ids.process("model-process"),
    operationRef: ids.operation("model-operation"),
    projectId: ids.project("model-project"),
    tenantRef: ids.tenant("model-tenant"),
    requesterRef: ids.requester("model-requester"),
    stepCommandId: ids.scopeCommand("model-command-g1"),
    stepDigest: ids.digest("model-digest-g1"),
    creationAuthorityBasis: authorityBasis,
  });
}

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
    generation: process.generation,
    revision: process.revision,
    attemptCount: process.attemptCount,
    blockReason: process.blockReason,
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
    receiptKind: process.receipt?.kind ?? null,
    revision: process.revision,
    generation: process.generation,
    hasDispatchAuthority: process.dispatchAuthorityBasis !== null,
    hasAdmissionAuthority: process.admissionAuthorityBasis !== null,
  });
}

export function domainAuthorityRecheckExhaustedTrace() {
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
  return Object.freeze({
    state: process.state,
    receiptKind: process.receipt?.kind ?? null,
    revision: process.revision,
    blockReason: process.blockReason,
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
    receiptKind: process.receipt?.kind ?? null,
    revision: process.revision,
    blockReason: process.blockReason,
    hasDispatchAuthority: process.dispatchAuthorityBasis !== null,
    hasAdmissionAuthority: process.admissionAuthorityBasis !== null,
  });
}

export function domainPolicyBoundary(input: {
  maxAttempts: number;
  attemptCount: number;
  maxPreparationGenerations: number;
  generation: number;
  resumptionCount: number;
  retainsAdmittedReceipt: boolean;
}) {
  return Object.freeze({
    attemptExhausted: safeRetryExhausted(
      {
        defaultDelayMs: 1,
        maxDelayMs: 1,
        maxAttempts: input.maxAttempts,
      },
      input.attemptCount,
    ),
    generationExhausted: preparationGenerationExhausted(input),
  });
}

export function domainVocabularyEvidence() {
  const receiptKinds = ["admitted", "rejected", "stale", "conflict"] as const;
  const observedReceipts = receiptKinds.map((kind) => {
    let process = claimDispatch(initialProcess());
    process = authorizeDispatch(process, authorityBasis);
    return observeScopeAdmissionReceipt(process, {
      kind,
      receiptRef: ids.orchestratorReceipt(`model-vocabulary-${kind}`),
      receiptDigest: process.stepDigest,
    });
  });

  const denied = blockDispatchForAuthority(
    claimDispatch(initialProcess()),
    "AUTHORITY_DENIED",
  );
  const restricted = blockDispatchForAuthority(
    claimDispatch(initialProcess()),
    "COMMERCIAL_RESTRICTION",
  );
  const exhausted = releaseUnsubmittedDispatch(
    claimDispatch(initialProcess()),
    true,
  );
  const cancelled = requestScopeAdmissionCancellation(initialProcess()).process;
  const integrity = blockScopeAdmissionForIntegrity(initialProcess());
  const authorityExhausted = domainAuthorityRecheckExhaustedTrace();

  return Object.freeze({
    receiptKinds: Object.freeze(
      observedReceipts.map((process) => process.receipt?.kind),
    ),
    blockReasons: Object.freeze([
      denied.blockReason,
      authorityExhausted.blockReason,
      restricted.blockReason,
      ...observedReceipts
        .filter((process) => process.blockReason !== null)
        .map((process) => process.blockReason),
      exhausted.blockReason,
      cancelled.blockReason,
      integrity.blockReason,
    ]),
  });
}
