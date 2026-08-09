import {
  authorizeDispatch as authorizeProcessDispatch,
  blockDispatchForAuthority,
  claimDispatch,
  releaseUnsubmittedDispatch,
  requireReconciliation,
  type ManagedScopeAdmissionProcess,
  type ScopeAdmissionReceipt,
} from "../../domain/managed-scope-admission-process.js";
import type { CreationAuthorityBasisSnapshot } from "../../domain/creation-authority-basis.js";
import type {
  CommandScope,
  CreateProductProjectCommandId,
  ProjectPreparationOperationRef,
  ScopeAdmissionLeaseId,
} from "../../domain/value-objects.js";
import type {
  AcceptedProjectCreationReceipt,
  CurrentAuthorityDisposition,
  ProjectCreationCommit,
  ProjectCreationCommitResult,
  ProjectManagementStore,
  ResumeScopeAdmissionCommitResult,
  CancelScopeAdmissionMutationResult,
  ScopeAdmissionAuthorityRecheckClaim,
  ScopeAdmissionDispatchClaim,
  ScopeAdmissionDispatchAuthorizationResult,
  ScopeAdmissionMutationResult,
  ScopeAdmissionOutboxRecord,
  ScopeAdmissionReconciliationTarget,
  ScopeAdmissionSnapshot,
} from "../../application/ports/project-management-store.js";
import { applyScopeAdmissionReceipt } from "../../application/apply-scope-admission-receipt.js";
import { authorityDispositionAt } from "../../application/evaluate-creation-authority.js";
import {
  claimAuthorityRecheckInMemory,
  recordAuthorityRecheckInMemory,
  scheduleAuthorityRecheckInMemory,
} from "./in-memory-authority-rechecks.js";
import {
  currentDispatchClaimState,
  expireDispatchLeasesInMemory,
} from "./in-memory-dispatch-leases.js";
import {
  cloneProjectManagementState,
  cancelPreparationInMemory,
  assertCreationGenesis,
  assertCreationIdentitiesAreUnused,
  completeCancellationInMemory,
  emptyProjectManagementState,
  projectCreationReceiptKey,
  preparationCommandReceiptKey,
  projectManagementSnapshot,
  recordHistoricalReceiptInMemory,
  recordKnownNonAcceptanceInMemory,
  resumePreparationInMemory,
} from "./in-memory-project-management-state.js";
import { recordReconciledReceiptInMemory } from "./in-memory-reconciliation.js";

export type CreationFailurePoint =
  | "project"
  | "admission"
  | "process"
  | "receipt"
  | "outbox";

export class InMemoryProjectManagementStore implements ProjectManagementStore {
  #state = emptyProjectManagementState();
  #tail: Promise<unknown> = Promise.resolve();
  #creationFailurePoint: CreationFailurePoint | null = null;
  #beforeCreationLinearization: (() => void) | null = null;
  #beforeReceiptLinearization: (() => void) | null = null;
  #afterDispatchAuthorization: (() => void) | null = null;

  constructor(private readonly clock: Readonly<{ now(): number }>) {}

  injectCreationFailure(point: CreationFailurePoint | null): void { this.#creationFailurePoint = point; }

  injectBeforeCreationLinearizationForTest(action: (() => void) | null): void { this.#beforeCreationLinearization = action; }

  injectBeforeReceiptLinearizationForTest(action: (() => void) | null): void { this.#beforeReceiptLinearization = action; }

  injectAfterDispatchAuthorizationForTest(action: (() => void) | null): void { this.#afterDispatchAuthorization = action; }

  advanceProjectRevisionForTest(operationRef: ProjectPreparationOperationRef): Promise<void> {
    return this.#exclusive(() => {
      const snapshot = projectManagementSnapshot(this.#state, operationRef);
      if (snapshot === null) {
        throw new Error("Cannot advance a missing Project revision.");
      }
      this.#state.projects.set(snapshot.project.id, Object.freeze({
        ...snapshot.project,
        revision: snapshot.project.revision + 1,
      }));
    });
  }

  async #exclusive<TResult>(work: () => TResult | Promise<TResult>): Promise<TResult> {
    const result = this.#tail.then(work);
    this.#tail = result.catch(() => null);
    return result;
  }

  #failAt(point: CreationFailurePoint): void {
    if (this.#creationFailurePoint === point) {
      throw new Error(`Injected creation failure at ${point}.`);
    }
  }

  loadCreationReceipt(
    commandScope: CommandScope,
    commandId: CreateProductProjectCommandId,
  ): Promise<AcceptedProjectCreationReceipt | null> {
    return this.#exclusive(
      () =>
        this.#state.receipts.get(
          projectCreationReceiptKey({ commandScope, commandId }),
        ) ?? null,
    );
  }

  commitCreation(
    commit: ProjectCreationCommit,
  ): Promise<ProjectCreationCommitResult> {
    return this.#exclusive(() => {
      const key = projectCreationReceiptKey(commit.receipt);
      const prior = this.#state.receipts.get(key);
      if (prior !== undefined) {
        return prior.commandDigest === commit.receipt.commandDigest
          ? { kind: "replayed", receipt: prior }
          : { kind: "conflict" };
      }
      this.#beforeCreationLinearization?.();
      if (this.clock.now() >= commit.process.creationAuthorityBasis.validUntil) {
        return { kind: "authority-expired" };
      }
      const next = cloneProjectManagementState(this.#state);
      assertCreationGenesis(commit);
      assertCreationIdentitiesAreUnused(this.#state, commit);
      this.#failAt("project");
      next.projects.set(commit.project.id, commit.project);
      this.#failAt("admission");
      next.admissions.set(commit.project.id, commit.admission);
      this.#failAt("process");
      next.processes.set(commit.process.id, commit.process);
      next.processByOperation.set(commit.process.operationRef, commit.process.id);
      this.#failAt("receipt");
      next.receipts.set(key, commit.receipt);
      this.#failAt("outbox");
      next.outboxes.set(commit.outbox.id, commit.outbox);
      this.#state = next;
      return { kind: "created", receipt: commit.receipt };
    });
  }

  claimPending(input: {
    leaseId: ScopeAdmissionLeaseId;
    now: number;
    leaseExpiresAt: number;
  }): Promise<ScopeAdmissionDispatchClaim | null> {
    return this.#exclusive(() => {
      if (input.leaseExpiresAt <= input.now) {
        throw new TypeError("Scope-admission lease must expire after it is issued.");
      }
      expireDispatchLeasesInMemory(this.#state, input.now);
      const entry = [...this.#state.outboxes.entries()]
        .filter(
          ([, outbox]) =>
            outbox.state === "pending" && outbox.notBefore <= input.now,
        )
        .toSorted(([left], [right]) => left.localeCompare(right, "en"))[0];
      if (entry === undefined) {
        return null;
      }
      const [outboxId, outbox] = entry;
      const process = this.#state.processes.get(outbox.processId);
      if (
        process === undefined ||
        process.generation !== outbox.processGeneration ||
        process.stepCommandId !== outbox.stepCommandId ||
        process.stepDigest !== outbox.stepDigest
      ) {
        this.#state.outboxes.set(outboxId, {
          ...outbox,
          state: "superseded",
          leaseId: null,
          leaseExpiresAt: null,
        });
        return null;
      }
      const project = this.#state.projects.get(process.projectId);
      const admission = this.#state.admissions.get(process.projectId);
      if (project === undefined || admission === undefined) {
        throw new Error("Scope-admission process references a missing Project.");
      }
      const claimedProcess = claimDispatch(process);
      this.#state.processes.set(process.id, claimedProcess);
      this.#state.outboxes.set(outboxId, {
        ...outbox,
        state: "leased",
        leaseId: input.leaseId,
        leaseExpiresAt: input.leaseExpiresAt,
      });
      return Object.freeze({
        leaseId: input.leaseId,
        leaseExpiresAt: input.leaseExpiresAt,
        outboxId: outbox.id,
        expectedProcessRevision: claimedProcess.revision,
        expectedProjectIncarnation: project.incarnation,
        expectedProjectRevision: project.revision,
        expectedAdmissionRevision: admission.revision,
        expectedAdmissionLifecycleEpoch: admission.lifecycleEpoch,
        project,
        process: claimedProcess,
      });
    });
  }

  authorizeDispatch(
    claim: ScopeAdmissionDispatchClaim,
    basis: CreationAuthorityBasisSnapshot,
  ): Promise<ScopeAdmissionDispatchAuthorizationResult> {
    return this.#exclusive(() => {
      const current = currentDispatchClaimState(this.#state, this.clock, claim);
      if (
        current === null ||
        basis.validUntil <= basis.checkedAt ||
        basis.validUntil <= this.clock.now()
      ) {
        return { kind: "stale" };
      }
      const process = authorizeProcessDispatch(current.process, basis);
      this.#state.processes.set(process.id, process);
      this.#afterDispatchAuthorization?.();
      return {
        kind: "authorized",
        claim: Object.freeze({
          ...claim,
          expectedProcessRevision: process.revision,
          process,
        }),
      };
    });
  }

  recordPreDispatchAuthorityDenied(
    claim: ScopeAdmissionDispatchClaim,
    blockReason: "AUTHORITY_DENIED" | "COMMERCIAL_RESTRICTION",
  ): Promise<ScopeAdmissionMutationResult> {
    return this.#exclusive(() => {
      const current = currentDispatchClaimState(this.#state, this.clock, claim);
      if (current === null) {
        return { kind: "stale" };
      }
      this.#state.processes.set(
        current.process.id,
        blockDispatchForAuthority(current.process, blockReason),
      );
      this.#state.outboxes.set(current.outbox.id, {
        ...current.outbox,
        state: "consumed",
        leaseId: null,
        leaseExpiresAt: null,
      });
      return { kind: "applied" };
    });
  }

  releaseNotSubmitted(
    claim: ScopeAdmissionDispatchClaim,
    input: Readonly<{
      retryAt: number;
      exhausted: boolean;
      exhaustedReason?: Parameters<typeof releaseUnsubmittedDispatch>[2];
    }>,
  ): Promise<ScopeAdmissionMutationResult> {
    return this.#exclusive(() => {
      const current = currentDispatchClaimState(this.#state, this.clock, claim);
      if (current === null) {
        return { kind: "stale" };
      }
      this.#state.processes.set(
        current.process.id,
        releaseUnsubmittedDispatch(
          current.process,
          input.exhausted,
          input.exhaustedReason,
        ),
      );
      this.#state.outboxes.set(current.outbox.id, {
        ...current.outbox,
        state: input.exhausted ? "consumed" : "pending",
        notBefore: input.retryAt,
        leaseId: null,
        leaseExpiresAt: null,
      });
      return { kind: "applied" };
    });
  }

  recordUnknownOutcome(
    claim: ScopeAdmissionDispatchClaim,
  ): Promise<ScopeAdmissionMutationResult> {
    return this.#exclusive(() => {
      const current = currentDispatchClaimState(this.#state, this.clock, claim);
      if (current === null) {
        return { kind: "stale" };
      }
      this.#state.processes.set(
        current.process.id,
        requireReconciliation(current.process),
      );
      this.#state.outboxes.set(current.outbox.id, {
        ...current.outbox,
        state: "consumed",
        leaseId: null,
        leaseExpiresAt: null,
      });
      return { kind: "applied" };
    });
  }

  recordDispatchReceipt(
    claim: ScopeAdmissionDispatchClaim,
    receipt: ScopeAdmissionReceipt,
    authority: CurrentAuthorityDisposition,
    authorityRecheckAt: number,
  ): Promise<ScopeAdmissionMutationResult> {
    return this.#exclusive(() => {
      const current = currentDispatchClaimState(this.#state, this.clock, claim);
      if (current === null) {
        return recordHistoricalReceiptInMemory(this.#state, claim, receipt);
      }
      this.#beforeReceiptLinearization?.();
      const result = applyScopeAdmissionReceipt({
        process: current.process,
        admission: current.admission,
        receipt,
        authority: this.#authorityAtLinearization(authority),
      });
      this.#state.processes.set(current.process.id, result.process);
      this.#state.admissions.set(result.admission.projectId, result.admission);
      this.#state.outboxes.set(current.outbox.id, {
        ...current.outbox,
        state: "consumed",
        leaseId: null,
        leaseExpiresAt: null,
      });
      if (result.process.state === "receipt-observed") {
        scheduleAuthorityRecheckInMemory(
          this.#state,
          result.process,
          authorityRecheckAt,
        );
      }
      return result.integrityConflict
        ? { kind: "integrity-conflict" }
        : { kind: "applied" };
    });
  }

  loadReconciliationTarget(
    operationRef: ProjectPreparationOperationRef,
  ): Promise<ScopeAdmissionReconciliationTarget | null> {
    return this.#exclusive(() => {
      const snapshot = projectManagementSnapshot(this.#state, operationRef);
      if (snapshot === null) {
        return null;
      }
      if (
        snapshot.process.state !== "reconcile-required" &&
        snapshot.process.state !== "cancel-reconcile-required"
      ) {
        return null;
      }
      return Object.freeze({
        expectedProcessRevision: snapshot.process.revision,
        expectedProjectIncarnation: snapshot.project.incarnation,
        expectedProjectRevision: snapshot.project.revision,
        expectedAdmissionRevision: snapshot.admission.revision,
        expectedAdmissionLifecycleEpoch: snapshot.admission.lifecycleEpoch,
        project: snapshot.project,
        process: snapshot.process,
      });
    });
  }

  recordReconciledReceipt(
    target: ScopeAdmissionReconciliationTarget,
    receipt: ScopeAdmissionReceipt,
    authority: CurrentAuthorityDisposition,
    authorityRecheckAt: number,
  ): Promise<ScopeAdmissionMutationResult> {
    return this.#exclusive(() => recordReconciledReceiptInMemory({
      state: this.#state,
      target,
      receipt,
      authority,
      authorityRecheckAt,
      clock: this.clock,
      beforeLinearization: () => this.#beforeReceiptLinearization?.(),
    }));
  }

  claimPendingAuthorityRecheck(input: {
    leaseId: ScopeAdmissionLeaseId;
    now: number;
    leaseExpiresAt: number;
  }): Promise<ScopeAdmissionAuthorityRecheckClaim | null> {
    return this.#exclusive(() =>
      claimAuthorityRecheckInMemory(this.#state, input),
    );
  }

  recordAuthorityRecheck(
    claim: ScopeAdmissionAuthorityRecheckClaim,
    authority: CurrentAuthorityDisposition,
    retryAt: number,
    exhausted: boolean,
  ): Promise<ScopeAdmissionMutationResult> {
    return this.#exclusive(() =>
      recordAuthorityRecheckInMemory({
        state: this.#state,
        now: this.clock.now(),
        claim,
        authority,
        retryAt,
        exhausted,
      }),
    );
  }

  recordKnownNotAccepted(
    target: ScopeAdmissionReconciliationTarget,
    input: Readonly<{ retryAt: number; exhausted: boolean }>,
  ): Promise<ScopeAdmissionMutationResult> {
    return this.#exclusive(() =>
      recordKnownNonAcceptanceInMemory(this.#state, target, input),
    );
  }

  cancelPreparation(
    input: Parameters<ProjectManagementStore["cancelPreparation"]>[0],
  ): Promise<CancelScopeAdmissionMutationResult> {
    return this.#exclusive(() =>
      cancelPreparationInMemory(this.#state, this.clock.now(), input),
    );
  }

  recordCancellationReconciled(
    target: ScopeAdmissionReconciliationTarget,
    receipt: ScopeAdmissionReceipt | null,
  ): Promise<ScopeAdmissionMutationResult> {
    return this.#exclusive(() =>
      completeCancellationInMemory(this.#state, target, receipt),
    );
  }

  resumePreparation(input: Readonly<{
    identity: Parameters<ProjectManagementStore["resumePreparation"]>[0]["identity"];
    expected: ScopeAdmissionSnapshot;
    successor: ManagedScopeAdmissionProcess;
    outbox: ScopeAdmissionOutboxRecord | null;
    maxGenerations: number;
    operationAuthorityValidUntil: number;
  }>): Promise<ResumeScopeAdmissionCommitResult> {
    return this.#exclusive(() => {
      const now = this.clock.now();
      const result = resumePreparationInMemory(this.#state, now, input);
      const current = this.#state.processes.get(input.successor.id);
      if (
        result.kind === "applied" &&
        !result.replayed &&
        current?.state === "receipt-observed"
      ) {
        scheduleAuthorityRecheckInMemory(this.#state, current, now);
      }
      return result;
    });
  }

  loadPreparationCommandReceipt(
    commandScope: Parameters<ProjectManagementStore["loadPreparationCommandReceipt"]>[0],
    commandId: Parameters<ProjectManagementStore["loadPreparationCommandReceipt"]>[1],
  ) {
    return this.#exclusive(
      () => this.#state.preparationCommands.get(
        preparationCommandReceiptKey({ commandScope, commandId }),
      ) ?? null,
    );
  }

  loadByOperation(
    operationRef: ProjectPreparationOperationRef,
  ): Promise<ScopeAdmissionSnapshot | null> {
    return this.#exclusive(() =>
      projectManagementSnapshot(this.#state, operationRef),
    );
  }

  inspectCounts() {
    return Object.freeze({
      projects: this.#state.projects.size,
      admissions: this.#state.admissions.size,
      processes: this.#state.processes.size,
      receipts: this.#state.receipts.size,
      outboxes: this.#state.outboxes.size,
    });
  }

  inspectGenerationEvidence(
    processId: ManagedScopeAdmissionProcess["id"],
    generation: number,
  ) {
    return this.#state.generationHistory.get(
      `${processId.length}:${processId}${generation}`,
    ) ?? null;
  }

  inspectPreparationCommandReceiptCount(): number {
    return this.#state.preparationCommands.size;
  }

  #authorityAtLinearization(
    authority: CurrentAuthorityDisposition,
  ): CurrentAuthorityDisposition {
    return authorityDispositionAt(authority, this.clock.now());
  }

}
