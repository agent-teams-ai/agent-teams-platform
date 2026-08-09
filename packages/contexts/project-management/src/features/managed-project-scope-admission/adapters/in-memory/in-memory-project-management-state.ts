import {
  completeScopeAdmissionCancellation,
  releaseReconciledNonAcceptance,
  requestScopeAdmissionCancellation,
  type ManagedScopeAdmissionProcess,
  type ScopeAdmissionReceipt,
} from "../../domain/managed-scope-admission-process.js";
import type { ProductProject } from "../../domain/product-project.js";
import type { ProjectAdmissionAuthority } from "../../domain/project-admission-authority.js";
import type {
  AcceptedProjectCreationReceipt,
  CancelScopeAdmissionMutationResult,
  ProjectCreationCommit,
  PreparationCommandIdentity,
  PreparationCommandReceipt,
  ResumeScopeAdmissionCommitResult,
  ScopeAdmissionMutationResult,
  ScopeAdmissionOutboxRecord,
  ScopeAdmissionReconciliationTarget,
  ScopeAdmissionSnapshot,
} from "../../application/ports/project-management-store.js";
import type {
  ProjectPreparationOperationRef,
  ScopeAdmissionLeaseId,
} from "../../domain/value-objects.js";

export type InMemoryProjectManagementState = {
  projects: Map<string, ProductProject>;
  admissions: Map<string, ProjectAdmissionAuthority>;
  processes: Map<string, ManagedScopeAdmissionProcess>;
  processByOperation: Map<string, string>;
  receipts: Map<string, AcceptedProjectCreationReceipt>;
  outboxes: Map<string, ScopeAdmissionOutboxRecord>;
  preparationCommands: Map<string, PreparationCommandReceipt>;
  generationHistory: Map<string, Readonly<{
    process: ManagedScopeAdmissionProcess;
    lateReceipt: ScopeAdmissionReceipt | null;
    integrityConflict: boolean;
  }>>;
  authorityRechecks: Map<string, AuthorityRecheckRecord>;
};

export type AuthorityRecheckRecord = Readonly<{
  processId: ManagedScopeAdmissionProcess["id"];
  processGeneration: number;
  attemptCount: number;
  state: "pending" | "leased";
  notBefore: number;
  leaseId: ScopeAdmissionLeaseId | null;
  leaseExpiresAt: number | null;
}>;

export function emptyProjectManagementState(): InMemoryProjectManagementState {
  return {
    projects: new Map(),
    admissions: new Map(),
    processes: new Map(),
    processByOperation: new Map(),
    receipts: new Map(),
    outboxes: new Map(),
    preparationCommands: new Map(),
    generationHistory: new Map(),
    authorityRechecks: new Map(),
  };
}

export function cloneProjectManagementState(
  state: InMemoryProjectManagementState,
): InMemoryProjectManagementState {
  return {
    projects: new Map(state.projects),
    admissions: new Map(state.admissions),
    processes: new Map(state.processes),
    processByOperation: new Map(state.processByOperation),
    receipts: new Map(state.receipts),
    outboxes: new Map(state.outboxes),
    preparationCommands: new Map(state.preparationCommands),
    generationHistory: new Map(state.generationHistory),
    authorityRechecks: new Map(state.authorityRechecks),
  };
}

export function preparationCommandReceiptKey(
  identity: Pick<PreparationCommandIdentity, "commandScope" | "commandId">,
): string {
  return `${identity.commandScope.length}:${identity.commandScope}${identity.commandId.length}:${identity.commandId}`;
}

export function processGenerationKey(
  process: Pick<ManagedScopeAdmissionProcess, "id" | "generation">,
): string {
  return `${process.id.length}:${process.id}${process.generation}`;
}

export function projectCreationReceiptKey(
  receipt: Pick<
    AcceptedProjectCreationReceipt,
    "commandScope" | "commandId"
  >,
): string {
  return `${receipt.commandScope.length}:${receipt.commandScope}${receipt.commandId.length}:${receipt.commandId}`;
}

export function recordKnownNonAcceptanceInMemory(
  state: InMemoryProjectManagementState,
  target: ScopeAdmissionReconciliationTarget,
  input: Readonly<{ retryAt: number; exhausted: boolean }>,
): ScopeAdmissionMutationResult {
  const current = state.processes.get(target.process.id);
  const project = state.projects.get(target.project.id);
  const admission = state.admissions.get(target.project.id);
  const outboxEntry = [...state.outboxes.entries()].find(
    ([, item]) =>
      item.processId === target.process.id &&
      item.processGeneration === target.process.generation,
  );
  if (
    current === undefined || project === undefined || admission === undefined ||
    outboxEntry === undefined || current.revision !== target.expectedProcessRevision ||
    project.incarnation !== target.expectedProjectIncarnation ||
    project.revision !== target.expectedProjectRevision || project.lifecycle !== "open" ||
    admission.revision !== target.expectedAdmissionRevision ||
    admission.lifecycleEpoch !== target.expectedAdmissionLifecycleEpoch
  ) {
    return { kind: "stale" };
  }
  const [outboxId, outbox] = outboxEntry;
  state.processes.set(
    current.id,
    releaseReconciledNonAcceptance(current, input.exhausted),
  );
  state.outboxes.set(outboxId, {
    ...outbox,
    state: input.exhausted ? "consumed" : "pending",
    notBefore: input.retryAt,
    leaseId: null,
    leaseExpiresAt: null,
  });
  return { kind: "applied" };
}

export function projectManagementSnapshot(
  state: InMemoryProjectManagementState,
  operationRef: ProjectPreparationOperationRef,
): ScopeAdmissionSnapshot | null {
  const processId = state.processByOperation.get(operationRef);
  const process = processId === undefined ? undefined : state.processes.get(processId);
  if (process === undefined) {
    return null;
  }
  const project = state.projects.get(process.projectId);
  const admission = state.admissions.get(process.projectId);
  if (project === undefined || admission === undefined) {
    throw new Error("Project Management state is internally inconsistent.");
  }
  return { project, admission, process };
}

export function cancelPreparationInMemory(
  state: InMemoryProjectManagementState,
  now: number,
  input: Readonly<{
    identity: PreparationCommandIdentity;
    operationRef: ProjectPreparationOperationRef;
    expectedGeneration: number;
    authorityValidUntil: number;
  }>,
): CancelScopeAdmissionMutationResult {
  const key = preparationCommandReceiptKey(input.identity);
  const prior = state.preparationCommands.get(key);
  if (prior !== undefined) {
    if (prior.identity.commandDigest !== input.identity.commandDigest || prior.kind !== "cancel") {
      return { kind: "conflict" };
    }
    if (prior.outcome.kind !== "cancel") {
      throw new Error("Preparation command receipt kind is internally inconsistent.");
    }
    return { kind: "applied", outcome: prior.outcome.result, replayed: true };
  }
  const snapshot = projectManagementSnapshot(state, input.operationRef);
  if (snapshot === null) {
    return { kind: "not-found" };
  }
  if (snapshot.process.generation !== input.expectedGeneration) {
    return { kind: "stale" };
  }
  if (now >= input.authorityValidUntil) {
    return { kind: "stale" };
  }
  const transition = requestScopeAdmissionCancellation(snapshot.process);
  if (transition.process === snapshot.process) {
    return { kind: "applied", outcome: transition.outcome, replayed: false };
  }
  state.processes.set(snapshot.process.id, transition.process);
  if (transition.outcome !== "reconciliation-required") {
    for (const [id, outbox] of state.outboxes) {
      if (
        outbox.processId === snapshot.process.id &&
        outbox.processGeneration === snapshot.process.generation &&
        outbox.state !== "consumed"
      ) {
        state.outboxes.set(id, {
          ...outbox,
          state: "superseded",
          leaseId: null,
          leaseExpiresAt: null,
        });
      }
    }
  }
  state.preparationCommands.set(key, Object.freeze({
    identity: input.identity,
    kind: "cancel",
    operationRef: input.operationRef,
    expectedGeneration: input.expectedGeneration,
    outcome: Object.freeze({ kind: "cancel", result: transition.outcome }),
  }));
  return { kind: "applied", outcome: transition.outcome, replayed: false };
}

export function completeCancellationInMemory(
  state: InMemoryProjectManagementState,
  target: ScopeAdmissionReconciliationTarget,
  receipt: ScopeAdmissionReceipt | null,
): ScopeAdmissionMutationResult {
  const current = state.processes.get(target.process.id);
  const project = state.projects.get(target.project.id);
  const admission = state.admissions.get(target.project.id);
  if (
    current === undefined || project === undefined || admission === undefined ||
    current.revision !== target.expectedProcessRevision ||
    current.generation !== target.process.generation ||
    project.incarnation !== target.expectedProjectIncarnation ||
    project.revision !== target.expectedProjectRevision || project.lifecycle !== "open" ||
    admission.revision !== target.expectedAdmissionRevision ||
    admission.lifecycleEpoch !== target.expectedAdmissionLifecycleEpoch
  ) {
    return { kind: "stale" };
  }
  const process = completeScopeAdmissionCancellation(current, receipt);
  state.processes.set(current.id, process);
  if (process.blockReason === "DATA_INTEGRITY_CONFLICT") {
    return { kind: "integrity-conflict" };
  }
  return process.blockReason === "DOWNSTREAM_CONFLICT"
    ? { kind: "downstream-conflict" }
    : { kind: "applied" };
}

export function resumePreparationInMemory(
  state: InMemoryProjectManagementState,
  now: number,
  input: Readonly<{
    identity: PreparationCommandIdentity;
    expected: ScopeAdmissionSnapshot;
    successor: ManagedScopeAdmissionProcess;
    outbox: ScopeAdmissionOutboxRecord | null;
    maxGenerations: number;
    operationAuthorityValidUntil: number;
  }>,
): ResumeScopeAdmissionCommitResult {
  const commandKey = preparationCommandReceiptKey(input.identity);
  const prior = state.preparationCommands.get(commandKey);
  const replay = replayedResumeCommit(prior, input.identity);
  if (replay !== null) {
    return replay;
  }
  const current = projectManagementSnapshot(
    state,
    input.expected.process.operationRef,
  );
  if (!matchesResumeSnapshot(current, input.expected)) {
    return { kind: "stale" };
  }
  if (current.process.generation !== input.expected.process.generation) {
    return { kind: "stale" };
  }
  if (
    input.successor.generation > input.maxGenerations ||
    input.successor.resumptionCount > input.maxGenerations
  ) {
    return { kind: "generation-limit" };
  }
  if (
    now >= input.successor.creationAuthorityBasis.validUntil ||
    now >= input.operationAuthorityValidUntil
  ) {
    return { kind: "authority-expired" };
  }
  if (
    input.successor.id !== current.process.id ||
    ![current.process.generation, current.process.generation + 1].includes(
      input.successor.generation,
    ) ||
    input.successor.resumptionCount !== current.process.resumptionCount + 1 ||
    (input.outbox !== null && state.outboxes.has(input.outbox.id))
  ) {
    return { kind: "stale" };
  }
  for (const [id, outbox] of state.outboxes) {
    if (outbox.processId === current.process.id && outbox.state !== "consumed") {
      state.outboxes.set(id, {
        ...outbox,
        state: "superseded",
        leaseId: null,
        leaseExpiresAt: null,
      });
    }
  }
  if (input.successor.generation > current.process.generation) {
    state.generationHistory.set(processGenerationKey(current.process), Object.freeze({
      process: current.process,
      lateReceipt: null,
      integrityConflict: false,
    }));
  }
  state.processes.set(current.process.id, input.successor);
  if (input.outbox !== null) {
    state.outboxes.set(input.outbox.id, input.outbox);
  }
  const predecessorReceiptRetained = current.process.receipt !== null;
  state.preparationCommands.set(commandKey, Object.freeze({
    identity: input.identity,
    kind: "resume",
    operationRef: current.process.operationRef,
    expectedGeneration: current.process.generation,
    outcome: Object.freeze({
      kind: "resume",
      result: "accepted",
      generation: input.successor.generation,
      predecessorReceiptRetained,
    }),
  }));
  return {
    kind: "applied",
    generation: input.successor.generation,
    predecessorReceiptRetained,
    replayed: false,
  };
}

function matchesResumeSnapshot(
  current: ScopeAdmissionSnapshot | null,
  expected: ScopeAdmissionSnapshot,
): current is ScopeAdmissionSnapshot {
  return current !== null &&
    current.process.revision === expected.process.revision &&
    current.process.generation === expected.process.generation &&
    current.project.incarnation === expected.project.incarnation &&
    current.project.revision === expected.project.revision &&
    current.project.lifecycle === "open" &&
    current.admission.revision === expected.admission.revision &&
    current.admission.lifecycleEpoch === expected.admission.lifecycleEpoch &&
    current.admission.state === "denied";
}

function replayedResumeCommit(
  prior: PreparationCommandReceipt | undefined,
  identity: PreparationCommandIdentity,
): ResumeScopeAdmissionCommitResult | null {
  if (prior === undefined) {
    return null;
  }
  if (prior.identity.commandDigest !== identity.commandDigest || prior.kind !== "resume") {
    return { kind: "conflict" };
  }
  if (prior.outcome.kind !== "resume") {
    throw new Error("Preparation command receipt kind is internally inconsistent.");
  }
  if (prior.outcome.result !== "accepted") {
    return { kind: "stale" };
  }
  return {
    kind: "applied",
    generation: prior.outcome.generation,
    predecessorReceiptRetained: prior.outcome.predecessorReceiptRetained,
    replayed: true,
  };
}

export function recordHistoricalReceiptInMemory(
  state: InMemoryProjectManagementState,
  target: ScopeAdmissionReconciliationTarget,
  receipt: ScopeAdmissionReceipt,
): ScopeAdmissionMutationResult {
  const key = processGenerationKey(target.process);
  const historical = state.generationHistory.get(key);
  if (
    historical === undefined ||
    historical.process.stepCommandId !== target.process.stepCommandId ||
    historical.process.stepDigest !== target.process.stepDigest ||
    receipt.receiptDigest !== historical.process.stepDigest
  ) {
    return { kind: "stale" };
  }
  if (
    historical.lateReceipt !== null &&
    (historical.lateReceipt.receiptRef !== receipt.receiptRef ||
      historical.lateReceipt.kind !== receipt.kind ||
      historical.lateReceipt.receiptDigest !== receipt.receiptDigest)
  ) {
    state.generationHistory.set(key, Object.freeze({
      ...historical,
      integrityConflict: true,
    }));
    return { kind: "integrity-conflict" };
  }
  state.generationHistory.set(key, Object.freeze({
    ...historical,
    lateReceipt: receipt,
  }));
  return { kind: "stale" };
}

export function assertCreationGenesis(commit: ProjectCreationCommit): void {
  if (
    commit.admission.projectId !== commit.project.id ||
    commit.process.projectId !== commit.project.id ||
    commit.process.tenantRef !== commit.project.tenantRef ||
    commit.receipt.projectId !== commit.project.id ||
    commit.receipt.operationRef !== commit.process.operationRef ||
    commit.outbox.processId !== commit.process.id ||
    commit.outbox.processGeneration !== commit.process.generation ||
    commit.outbox.stepCommandId !== commit.process.stepCommandId ||
    commit.outbox.stepDigest !== commit.process.stepDigest ||
    commit.receipt.acceptedAt >= commit.process.creationAuthorityBasis.validUntil
  ) {
    throw new Error("Project creation commit violates its genesis invariants.");
  }
}

export function assertCreationIdentitiesAreUnused(
  state: InMemoryProjectManagementState,
  commit: ProjectCreationCommit,
): void {
  if (
    state.projects.has(commit.project.id) ||
    state.admissions.has(commit.project.id) ||
    state.processes.has(commit.process.id) ||
    state.processByOperation.has(commit.process.operationRef) ||
    state.outboxes.has(commit.outbox.id)
  ) {
    throw new Error("Project creation attempted to reuse a durable identity.");
  }
}
