import type {
  ProjectManagementDependencies,
  ReconcileManagedScopeAdmissionResult,
} from "./contracts.js";
import {
  authorityDisposition,
  evaluateCreationAuthority,
} from "./evaluate-creation-authority.js";
import type { ScopeAdmissionReceipt } from "../domain/managed-scope-admission-process.js";
import type { ProjectPreparationOperationRef } from "../domain/value-objects.js";
import { safeRetryAt, safeRetryExhausted } from "./safe-retry-policy.js";
import type { ScopeAdmissionMutationResult } from "./ports/project-management-store.js";

function cancellationResult(
  result: ScopeAdmissionMutationResult,
): ReconcileManagedScopeAdmissionResult {
  if (result.kind === "applied") {
    return { kind: "cancelled" };
  }
  if (result.kind === "downstream-conflict") {
    return { kind: "blocked" };
  }
  return {
    kind: result.kind === "integrity-conflict" ? "integrity-conflict" : "stale",
  };
}

export function reconcileManagedScopeAdmissionUseCase(
  dependencies: ProjectManagementDependencies,
): (
  operationRef: ProjectPreparationOperationRef,
) => Promise<ReconcileManagedScopeAdmissionResult> {
  return async (operationRef) => {
    const target = await dependencies.store.loadReconciliationTarget(operationRef);
    if (target === null) {
      return { kind: "not-found" };
    }
    const cancelling = target.process.state === "cancel-reconcile-required";
    let receipt: ScopeAdmissionReceipt;
    if (target.process.receipt !== null) {
      receipt = target.process.receipt;
    } else {
      let recovery;
      try {
        recovery = await dependencies.orchestrationScopeAdmission.recover({
          tenantRef: target.project.tenantRef,
          projectId: target.project.id,
          projectIncarnation: target.project.incarnation,
          processId: target.process.id,
          processGeneration: target.process.generation,
          commandId: target.process.stepCommandId,
          commandDigest: target.process.stepDigest,
        });
      } catch {
        return { kind: "unresolved" };
      }
      if (recovery.kind === "unresolved") {
        return { kind: "unresolved" };
      }
      if (recovery.kind === "known-not-accepted") {
        if (cancelling) {
          const result = await dependencies.store.recordCancellationReconciled(
            target,
            null,
          );
          return cancellationResult(result);
        }
        const now = dependencies.clock.now();
        const exhausted = safeRetryExhausted(
          dependencies.safeRetryPolicy,
          target.process.attemptCount,
        );
        const result = await dependencies.store.recordKnownNotAccepted(target, {
          retryAt: safeRetryAt(
            dependencies.safeRetryPolicy,
            now,
            recovery.retryAfter,
          ),
          exhausted,
        });
        return result.kind === "applied"
          ? { kind: exhausted ? "blocked" : "retry" }
          : { kind: "stale" };
      }
      receipt = recovery.receipt;
    }
    if (cancelling) {
      const result = await dependencies.store.recordCancellationReconciled(
        target,
        receipt,
      );
      return cancellationResult(result);
    }
    const authority = authorityDisposition(
      await evaluateCreationAuthority({
        ports: dependencies.authorities,
        query: {
          tenantRef: target.process.tenantRef,
          requesterRef: target.process.requesterRef,
        },
        now: () => dependencies.clock.now(),
      }),
    );
    const result = await dependencies.store.recordReconciledReceipt(
      target,
      receipt,
      authority,
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
