import type { CreationAuthorityBasisSnapshot } from "../../domain/creation-authority-basis.js";
import { requestManagedScopeAdmission } from "../../domain/managed-scope-admission-process.js";
import { ids } from "../../domain/value-objects.js";

export const authorityBasis: CreationAuthorityBasisSnapshot = Object.freeze({
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

export function initialProcess() {
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

export function blockedTrace(process: ReturnType<typeof initialProcess>) {
  const authority =
    process.blockReason === "COMMERCIAL_RESTRICTION"
      ? "commercially-restricted"
      : process.blockReason === "AUTHORITY_DENIED"
        ? "denied"
        : "closed";
  return Object.freeze({
    state: process.state,
    authority,
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
