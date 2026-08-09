import { applyScopeAdmissionReceipt } from "../../application/apply-scope-admission-receipt.js";
import { authorityDispositionAt } from "../../application/evaluate-creation-authority.js";
import type {
  CurrentAuthorityDisposition,
  ScopeAdmissionMutationResult,
  ScopeAdmissionReconciliationTarget,
} from "../../application/ports/project-management-store.js";
import type {
  ManagedScopeAdmissionProcess,
  ScopeAdmissionReceipt,
} from "../../domain/managed-scope-admission-process.js";
import type { ProductProject } from "../../domain/product-project.js";
import type { ProjectAdmissionAuthority } from "../../domain/project-admission-authority.js";
import type { InMemoryProjectManagementState } from "./in-memory-project-management-state.js";
import {
  recordHistoricalReceiptInMemory,
} from "./in-memory-project-management-state.js";
import { scheduleAuthorityRecheckInMemory } from "./in-memory-authority-rechecks.js";

export function recordReconciledReceiptInMemory(
  input: Readonly<{
    state: InMemoryProjectManagementState;
    target: ScopeAdmissionReconciliationTarget;
    receipt: ScopeAdmissionReceipt;
    authority: CurrentAuthorityDisposition;
    authorityRecheckAt: number;
    clock: Readonly<{ now(): number }>;
    beforeLinearization(): void;
  }>,
): ScopeAdmissionMutationResult {
  const { state, target, receipt } = input;
  const current = state.processes.get(target.process.id);
  const project = state.projects.get(target.project.id);
  const admission = state.admissions.get(target.project.id);
  const snapshot = { current, project, admission, target };
  if (!matchesTargetSnapshot(snapshot)) {
    return current?.generation !== target.process.generation
      ? recordHistoricalReceiptInMemory(state, target, receipt)
      : { kind: "stale" };
  }
  if (isRecordedReceipt(snapshot.current, receipt)) {
    return { kind: "applied" };
  }
  input.beforeLinearization();
  const authority = authorityDispositionAt(input.authority, input.clock.now());
  const result = applyScopeAdmissionReceipt({
    process: snapshot.current,
    admission: snapshot.admission,
    receipt,
    authority,
  });
  state.processes.set(snapshot.current.id, result.process);
  state.admissions.set(result.admission.projectId, result.admission);
  if (result.process.state === "receipt-observed") {
    scheduleAuthorityRecheckInMemory(
      state,
      result.process,
      input.authorityRecheckAt,
    );
  }
  return result.integrityConflict
    ? { kind: "integrity-conflict" }
    : { kind: "applied" };
}

function matchesTargetSnapshot(input: Readonly<{
  current: ManagedScopeAdmissionProcess | undefined;
  project: ProductProject | undefined;
  admission: ProjectAdmissionAuthority | undefined;
  target: ScopeAdmissionReconciliationTarget;
}>): input is typeof input & {
  current: NonNullable<typeof input.current>;
  project: NonNullable<typeof input.project>;
  admission: NonNullable<typeof input.admission>;
} {
  const { current, project, admission, target } = input;
  return current !== undefined &&
    project !== undefined &&
    admission !== undefined &&
    current.revision === target.expectedProcessRevision &&
    current.generation === target.process.generation &&
    project.incarnation === target.expectedProjectIncarnation &&
    project.revision === target.expectedProjectRevision &&
    project.lifecycle === "open" &&
    admission.revision === target.expectedAdmissionRevision &&
    admission.lifecycleEpoch === target.expectedAdmissionLifecycleEpoch;
}

function isRecordedReceipt(
  process: ManagedScopeAdmissionProcess,
  receipt: ScopeAdmissionReceipt,
): boolean {
  return process.state === "ready" &&
    process.receipt?.receiptRef === receipt.receiptRef &&
    process.receipt.receiptDigest === receipt.receiptDigest &&
    process.receipt.kind === receipt.kind;
}
