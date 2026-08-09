import { applyScopeAdmissionReceipt } from "../../application/apply-scope-admission-receipt.js";
import { authorityDispositionAt } from "../../application/evaluate-creation-authority.js";
import type {
  CurrentAuthorityDisposition,
  ScopeAdmissionAuthorityRecheckClaim,
  ScopeAdmissionMutationResult,
} from "../../application/ports/project-management-store.js";
import {
  blockScopeAdmissionForAuthorityRecheckExhaustion,
  type ManagedScopeAdmissionProcess,
} from "../../domain/managed-scope-admission-process.js";
import type { ProductProject } from "../../domain/product-project.js";
import type { ProjectAdmissionAuthority } from "../../domain/project-admission-authority.js";
import type { ScopeAdmissionLeaseId } from "../../domain/value-objects.js";
import type {
  AuthorityRecheckRecord,
  InMemoryProjectManagementState,
} from "./in-memory-project-management-state.js";

function authorityRecheckKey(
  process: Pick<ManagedScopeAdmissionProcess, "id" | "generation">,
): string {
  return `${process.id.length}:${process.id}${process.generation}`;
}

function expireAuthorityRecheckLeases(
  state: InMemoryProjectManagementState,
  now: number,
): void {
  for (const [key, record] of state.authorityRechecks) {
    if (
      record.state === "leased" &&
      record.leaseExpiresAt !== null &&
      record.leaseExpiresAt <= now
    ) {
      state.authorityRechecks.set(key, Object.freeze({
        ...record,
        state: "pending",
        notBefore: now,
        leaseId: null,
        leaseExpiresAt: null,
      }));
    }
  }
}

export function scheduleAuthorityRecheckInMemory(
  state: InMemoryProjectManagementState,
  process: ManagedScopeAdmissionProcess,
  notBefore: number,
): void {
  state.authorityRechecks.set(authorityRecheckKey(process), Object.freeze({
    processId: process.id,
    processGeneration: process.generation,
    attemptCount: 0,
    state: "pending",
    notBefore,
    leaseId: null,
    leaseExpiresAt: null,
  }));
}

export function claimAuthorityRecheckInMemory(
  state: InMemoryProjectManagementState,
  input: Readonly<{
    leaseId: ScopeAdmissionLeaseId;
    now: number;
    leaseExpiresAt: number;
  }>,
): ScopeAdmissionAuthorityRecheckClaim | null {
  if (input.leaseExpiresAt <= input.now) {
    throw new TypeError("Authority-recheck lease must expire after it is issued.");
  }
  expireAuthorityRecheckLeases(state, input.now);
  const entry = [...state.authorityRechecks.entries()]
    .filter(([, record]) => record.state === "pending" && record.notBefore <= input.now)
    .toSorted(([left], [right]) => left.localeCompare(right, "en"))[0];
  if (entry === undefined) {
    return null;
  }
  const [key, record] = entry;
  const process = state.processes.get(record.processId);
  if (
    process === undefined ||
    process.generation !== record.processGeneration ||
    process.state !== "receipt-observed" ||
    process.receipt === null
  ) {
    state.authorityRechecks.delete(key);
    return null;
  }
  const project = state.projects.get(process.projectId);
  const admission = state.admissions.get(process.projectId);
  if (project === undefined || admission === undefined) {
    throw new Error("Authority recheck references missing Project state.");
  }
  state.authorityRechecks.set(key, Object.freeze({
    ...record,
    state: "leased",
    leaseId: input.leaseId,
    attemptCount: record.attemptCount,
    leaseExpiresAt: input.leaseExpiresAt,
  }));
  return Object.freeze({
    leaseId: input.leaseId,
    attemptCount: record.attemptCount,
    expectedProcessRevision: process.revision,
    expectedProjectIncarnation: project.incarnation,
    expectedProjectRevision: project.revision,
    expectedAdmissionRevision: admission.revision,
    expectedAdmissionLifecycleEpoch: admission.lifecycleEpoch,
    project,
    process,
  });
}

export function recordAuthorityRecheckInMemory(
  input: Readonly<{
    state: InMemoryProjectManagementState;
    now: number;
    claim: ScopeAdmissionAuthorityRecheckClaim;
    authority: CurrentAuthorityDisposition;
    retryAt: number;
    exhausted: boolean;
  }>,
): ScopeAdmissionMutationResult {
  const { state, now, claim, authority, retryAt, exhausted } = input;
  const key = authorityRecheckKey(claim.process);
  const record = state.authorityRechecks.get(key);
  const current = state.processes.get(claim.process.id);
  const project = state.projects.get(claim.project.id);
  const admission = state.admissions.get(claim.project.id);
  if (
    !validRecheckLease(record, claim, now) ||
    !matchesRecheckSnapshot(current, project, admission, claim)
  ) {
    return { kind: "stale" };
  }
  if (admission === undefined || current.receipt === null) {
    throw new Error("Validated authority-recheck state became inconsistent.");
  }
  const currentAuthority = authorityDispositionAt(authority, now);
  const result = applyScopeAdmissionReceipt({
    process: current,
    admission,
    receipt: current.receipt,
    authority: currentAuthority,
  });
  state.processes.set(current.id, result.process);
  state.admissions.set(result.admission.projectId, result.admission);
  if (result.process.state === "receipt-observed" && exhausted) {
    state.processes.set(
      current.id,
      blockScopeAdmissionForAuthorityRecheckExhaustion(
        result.process,
        currentAuthority.kind === "defer"
          ? currentAuthority.exhaustionReason
          : "AUTHORITY_RECHECK_EXHAUSTED",
      ),
    );
    state.authorityRechecks.delete(key);
  } else if (result.process.state === "receipt-observed") {
    state.authorityRechecks.set(key, Object.freeze({
      ...record,
      attemptCount: record.attemptCount + 1,
      state: "pending",
      notBefore: retryAt,
      leaseId: null,
      leaseExpiresAt: null,
    }));
  } else {
    state.authorityRechecks.delete(key);
  }
  return result.integrityConflict
    ? { kind: "integrity-conflict" }
    : { kind: "applied" };
}

function validRecheckLease(
  record: AuthorityRecheckRecord | undefined,
  claim: ScopeAdmissionAuthorityRecheckClaim,
  now: number,
): record is AuthorityRecheckRecord {
  return record !== undefined &&
    record.state === "leased" &&
    record.leaseId === claim.leaseId &&
    record.leaseExpiresAt !== null &&
    record.leaseExpiresAt > now;
}

function matchesRecheckSnapshot(
  current: ManagedScopeAdmissionProcess | undefined,
  project: ProductProject | undefined,
  admission: ProjectAdmissionAuthority | undefined,
  claim: ScopeAdmissionAuthorityRecheckClaim,
): current is ManagedScopeAdmissionProcess {
  return current !== undefined && project !== undefined && admission !== undefined &&
    current.revision === claim.expectedProcessRevision &&
    current.generation === claim.process.generation &&
    project.incarnation === claim.expectedProjectIncarnation &&
    project.revision === claim.expectedProjectRevision &&
    project.lifecycle === "open" &&
    admission.revision === claim.expectedAdmissionRevision &&
    admission.lifecycleEpoch === claim.expectedAdmissionLifecycleEpoch &&
    current.receipt !== null;
}
