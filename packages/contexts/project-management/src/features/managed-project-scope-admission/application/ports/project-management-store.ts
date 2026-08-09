import type {
  ManagedScopeAdmissionProcess,
  ScopeAdmissionReceipt,
  ScopeAdmissionBlockReason,
} from "../../domain/managed-scope-admission-process.js";
import type { ProductProject } from "../../domain/product-project.js";
import type { ProjectAdmissionAuthority } from "../../domain/project-admission-authority.js";
import type {
  CanonicalCommandDigest,
  CommandScope,
  CreateProductProjectCommandId,
  Instant,
  ProjectPreparationCommandId,
  ProjectPreparationOperationRef,
  ScopeAdmissionLeaseId,
  ScopeAdmissionOutboxId,
} from "../../domain/value-objects.js";
import type { CreationAuthorityBasisSnapshot } from "../../domain/creation-authority-basis.js";

export type AcceptedProjectCreationReceipt = Readonly<{
  commandScope: CommandScope;
  commandId: CreateProductProjectCommandId;
  commandDigest: CanonicalCommandDigest;
  projectId: ProductProject["id"];
  operationRef: ProjectPreparationOperationRef;
  acceptedAt: Instant;
}>;

export type ScopeAdmissionOutboxRecord = Readonly<{
  id: ScopeAdmissionOutboxId;
  processId: ManagedScopeAdmissionProcess["id"];
  processGeneration: ManagedScopeAdmissionProcess["generation"];
  stepCommandId: ManagedScopeAdmissionProcess["stepCommandId"];
  stepDigest: ManagedScopeAdmissionProcess["stepDigest"];
  state: "pending" | "leased" | "consumed" | "superseded";
  notBefore: Instant;
  leaseId: ScopeAdmissionLeaseId | null;
  leaseExpiresAt: Instant | null;
}>;

export type ProjectCreationCommit = Readonly<{
  project: ProductProject;
  admission: ProjectAdmissionAuthority;
  process: ManagedScopeAdmissionProcess;
  receipt: AcceptedProjectCreationReceipt;
  outbox: ScopeAdmissionOutboxRecord;
}>;

export type ProjectCreationCommitResult =
  | Readonly<{ kind: "created"; receipt: AcceptedProjectCreationReceipt }>
  | Readonly<{ kind: "replayed"; receipt: AcceptedProjectCreationReceipt }>
  | Readonly<{ kind: "authority-expired" }>
  | Readonly<{ kind: "conflict" }>;

export interface ProjectCreationUnitOfWork {
  loadCreationReceipt(
    commandScope: CommandScope,
    commandId: CreateProductProjectCommandId,
  ): Promise<AcceptedProjectCreationReceipt | null>;
  commitCreation(commit: ProjectCreationCommit): Promise<ProjectCreationCommitResult>;
}

export type ScopeAdmissionDispatchClaim = Readonly<{
  leaseId: ScopeAdmissionLeaseId;
  leaseExpiresAt: Instant;
  outboxId: ScopeAdmissionOutboxId;
  expectedProcessRevision: number;
  expectedProjectIncarnation: number;
  expectedProjectRevision: number;
  expectedAdmissionRevision: number;
  expectedAdmissionLifecycleEpoch: number;
  project: ProductProject;
  process: ManagedScopeAdmissionProcess;
}>;

export type ScopeAdmissionReconciliationTarget = Readonly<{
  expectedProcessRevision: number;
  expectedProjectIncarnation: number;
  expectedProjectRevision: number;
  expectedAdmissionRevision: number;
  expectedAdmissionLifecycleEpoch: number;
  project: ProductProject;
  process: ManagedScopeAdmissionProcess;
}>;

export type ScopeAdmissionAuthorityRecheckClaim = ScopeAdmissionReconciliationTarget &
  Readonly<{ leaseId: ScopeAdmissionLeaseId; attemptCount: number }>;

export type ScopeAdmissionDispatchAuthorizationResult =
  | Readonly<{
      kind: "authorized";
      claim: ScopeAdmissionDispatchClaim;
    }>
  | Readonly<{ kind: "stale" }>;

export type CurrentAuthorityDisposition =
  | Readonly<{ kind: "allow"; basis: CreationAuthorityBasisSnapshot }>
  | Readonly<{
      kind: "deny";
      blockReason: "AUTHORITY_DENIED" | "COMMERCIAL_RESTRICTION";
    }>
  | Readonly<{
      kind: "defer";
      exhaustionReason: "AUTHORITY_RECHECK_EXHAUSTED" | "COMMERCIAL_RESTRICTION";
    }>;

export type ScopeAdmissionMutationResult =
  | Readonly<{ kind: "applied" }>
  | Readonly<{ kind: "stale" }>
  | Readonly<{ kind: "downstream-conflict" }>
  | Readonly<{ kind: "integrity-conflict" }>;

export type CancelScopeAdmissionMutationResult =
  | Readonly<{
      kind: "applied";
      outcome: "cancelled" | "reconciliation-required" | "already-completed";
      replayed: boolean;
    }>
  | Readonly<{ kind: "not-found" }>
  | Readonly<{ kind: "stale" }>
  | Readonly<{ kind: "conflict" }>;

export type PreparationCommandIdentity = Readonly<{
  commandScope: CommandScope;
  commandId: ProjectPreparationCommandId;
  commandDigest: CanonicalCommandDigest;
}>;

export type PreparationCommandReceipt = Readonly<{
  identity: PreparationCommandIdentity;
  kind: "cancel" | "resume";
  operationRef: ProjectPreparationOperationRef;
  expectedGeneration: number;
  outcome:
    | Readonly<{
        kind: "cancel";
        result:
          | "cancelled"
          | "reconciliation-required"
          | "already-completed";
      }>
    | Readonly<{
        kind: "resume";
        result: "accepted";
        generation: number;
        predecessorReceiptRetained: boolean;
      }>;
}>;

export type ResumeScopeAdmissionCommitResult =
  | Readonly<{
      kind: "applied";
      generation: number;
      predecessorReceiptRetained: boolean;
      replayed: boolean;
    }>
  | Readonly<{ kind: "authority-expired" }>
  | Readonly<{ kind: "generation-limit" | "stale" | "conflict" }>;

export interface ScopeAdmissionUnitOfWork {
  claimPending(input: {
    leaseId: ScopeAdmissionLeaseId;
    now: Instant;
    leaseExpiresAt: Instant;
  }): Promise<ScopeAdmissionDispatchClaim | null>;
  authorizeDispatch(
    claim: ScopeAdmissionDispatchClaim,
    basis: CreationAuthorityBasisSnapshot,
  ): Promise<ScopeAdmissionDispatchAuthorizationResult>;
  recordPreDispatchAuthorityDenied(
    claim: ScopeAdmissionDispatchClaim,
    blockReason: "AUTHORITY_DENIED" | "COMMERCIAL_RESTRICTION",
  ): Promise<ScopeAdmissionMutationResult>;
  releaseNotSubmitted(
    claim: ScopeAdmissionDispatchClaim,
    input: Readonly<{
      retryAt: Instant;
      exhausted: boolean;
      exhaustedReason?: ScopeAdmissionBlockReason;
    }>,
  ): Promise<ScopeAdmissionMutationResult>;
  recordUnknownOutcome(claim: ScopeAdmissionDispatchClaim): Promise<ScopeAdmissionMutationResult>;
  recordDispatchReceipt(
    claim: ScopeAdmissionDispatchClaim,
    receipt: ScopeAdmissionReceipt,
    authority: CurrentAuthorityDisposition,
    authorityRecheckAt: Instant,
  ): Promise<ScopeAdmissionMutationResult>;
  loadReconciliationTarget(
    operationRef: ProjectPreparationOperationRef,
  ): Promise<ScopeAdmissionReconciliationTarget | null>;
  recordReconciledReceipt(
    target: ScopeAdmissionReconciliationTarget,
    receipt: ScopeAdmissionReceipt,
    authority: CurrentAuthorityDisposition,
    authorityRecheckAt: Instant,
  ): Promise<ScopeAdmissionMutationResult>;
  claimPendingAuthorityRecheck(input: {
    leaseId: ScopeAdmissionLeaseId;
    now: Instant;
    leaseExpiresAt: Instant;
  }): Promise<ScopeAdmissionAuthorityRecheckClaim | null>;
  recordAuthorityRecheck(
    claim: ScopeAdmissionAuthorityRecheckClaim,
    authority: CurrentAuthorityDisposition,
    retryAt: Instant,
    exhausted: boolean,
  ): Promise<ScopeAdmissionMutationResult>;
  recordKnownNotAccepted(
    target: ScopeAdmissionReconciliationTarget,
    input: Readonly<{ retryAt: Instant; exhausted: boolean }>,
  ): Promise<ScopeAdmissionMutationResult>;
  cancelPreparation(
    input: Readonly<{
      identity: PreparationCommandIdentity;
      operationRef: ProjectPreparationOperationRef;
      expectedGeneration: number;
      authorityValidUntil: Instant;
    }>,
  ): Promise<CancelScopeAdmissionMutationResult>;
  recordCancellationReconciled(
    target: ScopeAdmissionReconciliationTarget,
    receipt: ScopeAdmissionReceipt | null,
  ): Promise<ScopeAdmissionMutationResult>;
  resumePreparation(input: Readonly<{
    identity: PreparationCommandIdentity;
    expected: ScopeAdmissionSnapshot;
    successor: ManagedScopeAdmissionProcess;
    outbox: ScopeAdmissionOutboxRecord | null;
    maxGenerations: number;
    operationAuthorityValidUntil: Instant;
  }>): Promise<ResumeScopeAdmissionCommitResult>;
  loadPreparationCommandReceipt(
    commandScope: CommandScope,
    commandId: ProjectPreparationCommandId,
  ): Promise<PreparationCommandReceipt | null>;
}

export type ScopeAdmissionSnapshot = Readonly<{
  project: ProductProject;
  admission: ProjectAdmissionAuthority;
  process: ManagedScopeAdmissionProcess;
}>;

export interface ScopeAdmissionReadStore {
  loadByOperation(
    operationRef: ProjectPreparationOperationRef,
  ): Promise<ScopeAdmissionSnapshot | null>;
}

export type ProjectManagementStore = ProjectCreationUnitOfWork &
  ScopeAdmissionUnitOfWork &
  ScopeAdmissionReadStore;
