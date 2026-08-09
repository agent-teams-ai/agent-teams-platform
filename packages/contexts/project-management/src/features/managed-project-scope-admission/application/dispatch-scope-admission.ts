import type {
  DispatchManagedScopeAdmissionResult,
  ProjectManagementDependencies,
} from "./contracts.js";
import {
  authorityDisposition,
  evaluateCreationAuthority,
  type CreationAuthorityEvaluation,
} from "./evaluate-creation-authority.js";
import type { ScopeAdmissionDispatchClaim } from "./ports/project-management-store.js";
import type { ScopeAdmissionSubmission } from "./ports/orchestration-scope-admission.js";
import { safeRetryAt, safeRetryExhausted } from "./safe-retry-policy.js";

async function currentAuthority(
  dependencies: ProjectManagementDependencies,
  claim: ScopeAdmissionDispatchClaim,
): Promise<CreationAuthorityEvaluation> {
  return evaluateCreationAuthority({
    ports: dependencies.authorities,
    query: {
      tenantRef: claim.process.tenantRef,
      requesterRef: claim.process.requesterRef,
    },
    now: () => dependencies.clock.now(),
  });
}

async function releaseForRetry(
  dependencies: ProjectManagementDependencies,
  claim: ScopeAdmissionDispatchClaim,
  suggested?: number,
  exhaustedReason?: Parameters<
    ProjectManagementDependencies["store"]["releaseNotSubmitted"]
  >[1]["exhaustedReason"],
): Promise<DispatchManagedScopeAdmissionResult> {
  const exhausted = safeRetryExhausted(
    dependencies.safeRetryPolicy,
    claim.process.attemptCount,
  );
  const now = dependencies.clock.now();
  const result = await dependencies.store.releaseNotSubmitted(claim, {
    retryAt: safeRetryAt(dependencies.safeRetryPolicy, now, suggested),
    exhausted,
    ...(exhaustedReason === undefined ? {} : { exhaustedReason }),
  });
  if (result.kind !== "applied") {
    return { kind: "stale" };
  }
  return { kind: exhausted ? "blocked" : "retry" };
}

export function dispatchManagedScopeAdmissionUseCase(
  dependencies: ProjectManagementDependencies,
): () => Promise<DispatchManagedScopeAdmissionResult> {
  return async () => {
    const now = dependencies.clock.now();
    const claim = await dependencies.store.claimPending({
      leaseId: dependencies.ids.nextLeaseId(),
      now,
      leaseExpiresAt: now + dependencies.dispatchLeaseDurationMs,
    });
    if (claim === null) {
      return { kind: "idle" };
    }
    const lastMileAuthority = await currentAuthority(dependencies, claim);
    if (lastMileAuthority.kind === "denied") {
      const result = await dependencies.store.recordPreDispatchAuthorityDenied(
        claim,
        lastMileAuthority.dependency === "commercial-project-creation"
          ? "COMMERCIAL_RESTRICTION"
          : "AUTHORITY_DENIED",
      );
      return { kind: result.kind === "applied" ? "blocked" : "stale" };
    }
    if (lastMileAuthority.kind === "unavailable") {
      return releaseForRetry(
        dependencies,
        claim,
        lastMileAuthority.retryAfter,
        lastMileAuthority.dependency === "commercial-project-creation"
          ? "COMMERCIAL_RESTRICTION"
          : "SAFE_RETRY_EXHAUSTED",
      );
    }
    const authorization = await dependencies.store.authorizeDispatch(
      claim,
      lastMileAuthority.basis,
    );
    if (authorization.kind === "stale") {
      return { kind: "stale" };
    }
    const authorizedClaim = authorization.claim;
    const beforeSubmit = dependencies.clock.now();
    if (
      lastMileAuthority.basis.validUntil <= beforeSubmit ||
      authorizedClaim.leaseExpiresAt <= beforeSubmit
    ) {
      return { kind: "stale" };
    }
    let submission: ScopeAdmissionSubmission;
    try {
      submission = await dependencies.orchestrationScopeAdmission.submit({
        tenantRef: authorizedClaim.project.tenantRef,
        projectId: authorizedClaim.project.id,
        projectIncarnation: authorizedClaim.project.incarnation,
        processId: authorizedClaim.process.id,
        processGeneration: authorizedClaim.process.generation,
        commandId: authorizedClaim.process.stepCommandId,
        commandDigest: authorizedClaim.process.stepDigest,
        dispatchAuthority: lastMileAuthority.basis,
        dispatchLease: {
          leaseId: authorizedClaim.leaseId,
          validUntil: authorizedClaim.leaseExpiresAt,
        },
      });
    } catch {
      const result = await dependencies.store.recordUnknownOutcome(authorizedClaim);
      return {
        kind: result.kind === "applied" ? "reconcile-required" : "stale",
      };
    }
    if (submission.kind === "not-submitted") {
      return releaseForRetry(
        dependencies,
        authorizedClaim,
        submission.retryAfter,
      );
    }
    if (submission.kind === "outcome-unknown") {
      const result = await dependencies.store.recordUnknownOutcome(authorizedClaim);
      return {
        kind: result.kind === "applied" ? "reconcile-required" : "stale",
      };
    }
    const result = await dependencies.store.recordDispatchReceipt(
      authorizedClaim,
      submission.receipt,
      authorityDisposition(
        await currentAuthority(dependencies, authorizedClaim),
      ),
      safeRetryAt(
        dependencies.safeRetryPolicy,
        dependencies.clock.now(),
      ),
    );
    if (result.kind === "applied") {
      return { kind: "receipt-recorded" };
    }
    return {
      kind: result.kind === "integrity-conflict" ? "integrity-conflict" : "stale",
    };
  };
}
