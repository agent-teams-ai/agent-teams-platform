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
  type ScopeAdmissionBlockReason,
  type ScopeAdmissionReceipt,
} from "../domain/managed-scope-admission-process.js";
import { preparationGenerationExhausted } from "../domain/scope-admission-readiness.js";
import { ids } from "../domain/value-objects.js";
import { safeRetryExhausted } from "../application/safe-retry-policy.js";
import { dispatchManagedScopeAdmissionUseCase } from "../application/dispatch-scope-admission.js";
import { applyScopeAdmissionReceipt } from "../application/apply-scope-admission-receipt.js";
import type { ProjectManagementDependencies } from "../application/contracts.js";
import type { ScopeAdmissionDispatchClaim } from "../application/ports/project-management-store.js";
import { denyProjectAdmission } from "../domain/project-admission-authority.js";

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

function blockedTrace(process: ReturnType<typeof initialProcess>) {
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

async function productionCommercialRouting(
  decision: "denied" | "unavailable",
  exhausted = true,
) {
  let process = claimDispatch(initialProcess());
  if (decision === "unavailable" && exhausted) {
    process = claimDispatch(releaseUnsubmittedDispatch(process, false));
  }
  const claim = Object.freeze({ process }) as unknown as ScopeAdmissionDispatchClaim;
  let observedReason: ScopeAdmissionBlockReason | null = null;
  let denialCalls = 0;
  let releaseCalls = 0;
  let releaseExhausted: boolean | null = null;
  const allowed = Object.freeze({
    kind: "allowed" as const,
    evidenceRef: ids.authorityEvidence("model-routing-allowed"),
    revision: ids.authorityRevision("model-routing-allowed"),
    validUntil: authorityBasis.validUntil,
  });
  const dependencies = {
    authorities: {
      tenantAdmission: { decide: async () => allowed },
      projectCreation: { decide: async () => allowed },
      commercialCreation: {
        decide: async () =>
          decision === "denied"
            ? { kind: "denied" as const, reason: "MODEL_COMMERCIAL_DENIED" }
            : {
                kind: "unavailable" as const,
                reason: "MODEL_COMMERCIAL_UNAVAILABLE",
              },
      },
    },
    clock: { now: () => authorityBasis.checkedAt },
    dispatchLeaseDurationMs: 1_000,
    ids: { nextLeaseId: () => ids.lease("model-routing") },
    safeRetryPolicy: {
      defaultDelayMs: 1_000,
      maxDelayMs: 1_000,
      maxAttempts: 2,
    },
    store: {
      claimPending: async () => claim,
      recordPreDispatchAuthorityDenied: async (
        _claim: ScopeAdmissionDispatchClaim,
        blockReason: ScopeAdmissionBlockReason,
      ) => {
        denialCalls += 1;
        observedReason = blockReason;
        return { kind: "applied" as const };
      },
      releaseNotSubmitted: async (
        _claim: ScopeAdmissionDispatchClaim,
        input: {
          exhausted: boolean;
          exhaustedReason?: ScopeAdmissionBlockReason;
        },
      ) => {
        releaseCalls += 1;
        releaseExhausted = input.exhausted;
        observedReason = input.exhaustedReason ?? "SAFE_RETRY_EXHAUSTED";
        return { kind: "applied" as const };
      },
    },
  } as unknown as ProjectManagementDependencies;
  const result = await dispatchManagedScopeAdmissionUseCase(dependencies)();
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
  function observe(kind: ScopeAdmissionReceipt["kind"]) {
    let process = claimDispatch(initialProcess());
    process = authorizeDispatch(process, authorityBasis);
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
  const exhausted = releaseUnsubmittedDispatch(
    claimDispatch(initialProcess()),
    true,
  );
  const cancelled = requestScopeAdmissionCancellation(initialProcess()).process;
  const integrity = blockScopeAdmissionForIntegrity(initialProcess());
  const authorityExhausted = domainAuthorityRecheckExhaustedTrace();

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
