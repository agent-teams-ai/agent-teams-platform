import type {
  ProjectManagementDependencies,
  RecheckScopeAdmissionAuthorityResult,
} from "./contracts.js";
import {
  authorityDisposition,
  evaluateCreationAuthority,
} from "./evaluate-creation-authority.js";
import { safeRetryAt, safeRetryExhausted } from "./safe-retry-policy.js";

export function recheckScopeAdmissionAuthorityUseCase(
  dependencies: ProjectManagementDependencies,
): () => Promise<RecheckScopeAdmissionAuthorityResult> {
  return async () => {
    const now = dependencies.clock.now();
    const claim = await dependencies.store.claimPendingAuthorityRecheck({
      leaseId: dependencies.ids.nextLeaseId(),
      now,
      leaseExpiresAt: now + dependencies.dispatchLeaseDurationMs,
    });
    if (claim === null) {
      return { kind: "idle" };
    }
    const authority = authorityDisposition(
      await evaluateCreationAuthority({
        ports: dependencies.authorities,
        query: {
          tenantRef: claim.process.tenantRef,
          requesterRef: claim.process.requesterRef,
        },
        now: () => dependencies.clock.now(),
      }),
    );
    const result = await dependencies.store.recordAuthorityRecheck(
      claim,
      authority,
      safeRetryAt(dependencies.safeRetryPolicy, dependencies.clock.now()),
      safeRetryExhausted(
        dependencies.safeRetryPolicy,
        claim.attemptCount + 1,
      ),
    );
    if (result.kind !== "applied") {
      return {
        kind: result.kind === "integrity-conflict" ? "integrity-conflict" : "stale",
      };
    }
    const current = await dependencies.store.loadByOperation(
      claim.process.operationRef,
    );
    if (current === null || current.process.generation !== claim.process.generation) {
      return { kind: "stale" };
    }
    if (current.process.state === "ready") {
      return { kind: "ready" };
    }
    if (current.process.state === "blocked") {
      return { kind: "blocked" };
    }
    return { kind: "retry" };
  };
}
