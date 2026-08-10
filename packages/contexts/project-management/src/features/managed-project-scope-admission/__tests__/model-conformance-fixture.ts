import type { CreationAuthorityBasisSnapshot } from "../domain/creation-authority-basis.js";
import {
  authorizeDispatch,
  blockScopeAdmissionForAuthority,
  claimDispatch,
  completeScopeAdmissionCancellation,
  finalizeScopeAdmission,
  observeScopeAdmissionReceipt,
  requestManagedScopeAdmission,
  requestScopeAdmissionCancellation,
  requireReconciliation,
  resumeManagedScopeAdmission,
} from "../domain/managed-scope-admission-process.js";
import { ids } from "../domain/value-objects.js";

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
