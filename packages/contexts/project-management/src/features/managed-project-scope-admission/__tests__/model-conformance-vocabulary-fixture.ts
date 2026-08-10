import type { CreationAuthorityBasisSnapshot } from "../domain/creation-authority-basis.js";
import {
  authorizeDispatch,
  blockDispatchForAuthority,
  blockScopeAdmissionForAuthorityRecheckExhaustion,
  blockScopeAdmissionForIntegrity,
  claimDispatch,
  observeScopeAdmissionReceipt,
  releaseUnsubmittedDispatch,
  requestManagedScopeAdmission,
  requestScopeAdmissionCancellation,
  type ScopeAdmissionBlockReason,
  type ScopeAdmissionReceipt,
} from "../domain/managed-scope-admission-process.js";
import { ids } from "../domain/value-objects.js";

const basis: CreationAuthorityBasisSnapshot = Object.freeze({
  checkedAt: 1_800_000_000_000,
  validUntil: 1_800_000_060_000,
  evidence: Object.freeze([
    Object.freeze({
      source: "tenant-admission",
      evidenceRef: ids.authorityEvidence("model-vocabulary-tenant"),
      revision: ids.authorityRevision("model-vocabulary-tenant"),
      validUntil: 1_800_000_060_000,
    }),
    Object.freeze({
      source: "project-creation-authority",
      evidenceRef: ids.authorityEvidence("model-vocabulary-project"),
      revision: ids.authorityRevision("model-vocabulary-project"),
      validUntil: 1_800_000_060_000,
    }),
    Object.freeze({
      source: "commercial-project-creation",
      evidenceRef: ids.authorityEvidence("model-vocabulary-commercial"),
      revision: ids.authorityRevision("model-vocabulary-commercial"),
      validUntil: 1_800_000_060_000,
    }),
  ] as const),
});

function initialProcess() {
  return requestManagedScopeAdmission({
    id: ids.process("model-vocabulary-process"),
    operationRef: ids.operation("model-vocabulary-operation"),
    projectId: ids.project("model-vocabulary-project"),
    tenantRef: ids.tenant("model-vocabulary-tenant"),
    requesterRef: ids.requester("model-vocabulary-requester"),
    stepCommandId: ids.scopeCommand("model-vocabulary-command"),
    stepDigest: ids.digest("model-vocabulary-digest"),
    creationAuthorityBasis: basis,
  });
}

function exactVocabularyEvidence<T extends string>(
  evidence: Record<T, T | null | undefined>,
): readonly T[] {
  return Object.freeze(
    Object.entries(evidence).map(([expected, observed]) => {
      if (expected !== observed) {
        throw new Error(`Domain vocabulary evidence mismatch for ${expected}.`);
      }
      return expected as T;
    }),
  );
}

export function domainVocabularyEvidence() {
  function observe(kind: ScopeAdmissionReceipt["kind"]) {
    let process = authorizeDispatch(claimDispatch(initialProcess()), basis);
    return observeScopeAdmissionReceipt(process, {
      kind,
      receiptRef: ids.orchestratorReceipt(`model-vocabulary-${kind}`),
      receiptDigest: process.stepDigest,
    });
  }
  const admitted = observe("admitted");
  const rejected = observe("rejected");
  const stale = observe("stale");
  const conflict = observe("conflict");
  const denied = blockDispatchForAuthority(
    claimDispatch(initialProcess()),
    "AUTHORITY_DENIED",
  );
  const restricted = blockDispatchForAuthority(
    claimDispatch(initialProcess()),
    "COMMERCIAL_RESTRICTION",
  );
  const exhausted = releaseUnsubmittedDispatch(claimDispatch(initialProcess()), true);
  const cancelled = requestScopeAdmissionCancellation(initialProcess()).process;
  const integrity = blockScopeAdmissionForIntegrity(initialProcess());
  let authorityExhausted = authorizeDispatch(claimDispatch(initialProcess()), basis);
  authorityExhausted = observeScopeAdmissionReceipt(authorityExhausted, {
    kind: "admitted",
    receiptRef: ids.orchestratorReceipt("model-vocabulary-authority-exhausted"),
    receiptDigest: authorityExhausted.stepDigest,
  });
  authorityExhausted = blockScopeAdmissionForAuthorityRecheckExhaustion(
    authorityExhausted,
    "AUTHORITY_RECHECK_EXHAUSTED",
  );

  return Object.freeze({
    receiptKinds: exactVocabularyEvidence({
      admitted: admitted.receipt?.kind,
      rejected: rejected.receipt?.kind,
      stale: stale.receipt?.kind,
      conflict: conflict.receipt?.kind,
    } satisfies Record<
      ScopeAdmissionReceipt["kind"],
      ScopeAdmissionReceipt["kind"] | null | undefined
    >),
    blockReasons: exactVocabularyEvidence({
      AUTHORITY_DENIED: denied.blockReason,
      AUTHORITY_RECHECK_EXHAUSTED: authorityExhausted.blockReason,
      COMMERCIAL_RESTRICTION: restricted.blockReason,
      DOWNSTREAM_REJECTED: rejected.blockReason,
      DOWNSTREAM_STALE: stale.blockReason,
      DOWNSTREAM_CONFLICT: conflict.blockReason,
      SAFE_RETRY_EXHAUSTED: exhausted.blockReason,
      USER_CANCELLED: cancelled.blockReason,
      DATA_INTEGRITY_CONFLICT: integrity.blockReason,
    } satisfies Record<
      ScopeAdmissionBlockReason,
      ScopeAdmissionBlockReason | null | undefined
    >),
  });
}
