import type {
  ScopeAdmissionDispatchClaim,
  ScopeAdmissionOutboxRecord,
} from "../../application/ports/project-management-store.js";
import {
  releaseUnsubmittedDispatch,
  requireReconciliation,
  type ManagedScopeAdmissionProcess,
} from "../../domain/managed-scope-admission-process.js";
import type { ProjectAdmissionAuthority } from "../../domain/project-admission-authority.js";
import type { InMemoryProjectManagementState } from "./in-memory-project-management-state.js";

export type CurrentDispatchClaimState = Readonly<{
  process: ManagedScopeAdmissionProcess;
  admission: ProjectAdmissionAuthority;
  outbox: ScopeAdmissionOutboxRecord;
}>;

export function currentDispatchClaimState(
  state: InMemoryProjectManagementState,
  clock: Readonly<{ now(): number }>,
  claim: ScopeAdmissionDispatchClaim,
): CurrentDispatchClaimState | null {
  const process = state.processes.get(claim.process.id);
  const outbox = state.outboxes.get(claim.outboxId);
  const project = state.projects.get(claim.project.id);
  const admission = state.admissions.get(claim.project.id);
  if (
    process === undefined || outbox === undefined || project === undefined ||
    admission === undefined || process.revision !== claim.expectedProcessRevision ||
    project.incarnation !== claim.expectedProjectIncarnation ||
    project.revision !== claim.expectedProjectRevision || project.lifecycle !== "open" ||
    admission.revision !== claim.expectedAdmissionRevision ||
    admission.lifecycleEpoch !== claim.expectedAdmissionLifecycleEpoch ||
    outbox.state !== "leased" || outbox.leaseId !== claim.leaseId ||
    outbox.leaseExpiresAt === null || outbox.leaseExpiresAt <= clock.now()
  ) {
    return null;
  }
  return { process, admission, outbox };
}

export function expireDispatchLeasesInMemory(
  state: InMemoryProjectManagementState,
  now: number,
): void {
  for (const [outboxId, outbox] of state.outboxes) {
    if (
      outbox.state !== "leased" || outbox.leaseExpiresAt === null ||
      outbox.leaseExpiresAt > now
    ) {
      continue;
    }
    const process = state.processes.get(outbox.processId);
    if (process?.state === "dispatch-committed") {
      state.processes.set(process.id, requireReconciliation(process));
    } else if (process?.state === "claimed") {
      state.processes.set(process.id, releaseUnsubmittedDispatch(process, false));
    }
    state.outboxes.set(outboxId, {
      ...outbox,
      state: process?.state === "claimed" ? "pending" :
        process === undefined ? "superseded" : "consumed",
      notBefore: now,
      leaseId: null,
      leaseExpiresAt: null,
    });
  }
}
