import type { ScopeAdmissionReadiness } from "../domain/scope-admission-readiness.js";
import type {
  CommandScope,
  CreateProductProjectCommandId,
  Instant,
  ManagedScopeAdmissionProcessId,
  ProductProjectId,
  ProjectPreparationCommandId,
  ProjectPreparationOperationRef,
  ScopeAdmissionLeaseId,
  ScopeAdmissionOutboxId,
  ScopeAdmissionStepCommandId,
  TenantRef,
  TrustedRequesterRef,
} from "../domain/value-objects.js";
import type { CreationAuthorityPorts } from "./ports/creation-authorities.js";
import type { OrchestrationScopeAdmissionPort } from "./ports/orchestration-scope-admission.js";
import type { ProjectManagementStore } from "./ports/project-management-store.js";
import type { SafeRetryPolicy } from "./safe-retry-policy.js";
import type { CanonicalDigestPort } from "./canonical-command-digests.js";

export type CreateProductProjectCommand = Readonly<{
  commandScope: CommandScope;
  commandId: CreateProductProjectCommandId;
  requesterRef: TrustedRequesterRef;
  tenantRef: TenantRef;
  displayName: string;
}>;

export type CreateProductProjectResult =
  | Readonly<{
      kind: "accepted";
      projectId: ProductProjectId;
      operationRef: ProjectPreparationOperationRef;
      replayed: boolean;
    }>
  | Readonly<{ kind: "denied"; dependency: string; reason: string }>
  | Readonly<{
      kind: "unavailable";
      dependency: string;
      reason: string;
      retryAfter?: Instant;
    }>
  | Readonly<{ kind: "conflict"; reason: "COMMAND_DIGEST_MISMATCH" }>
  | Readonly<{ kind: "invalid"; issues: readonly string[] }>;

export type ProjectPreparationCommand = Readonly<{
  commandScope: CommandScope;
  commandId: ProjectPreparationCommandId;
  operationRef: ProjectPreparationOperationRef;
  expectedGeneration: number;
  requesterRef: TrustedRequesterRef;
  tenantRef: TenantRef;
}>;

export type GetScopeAdmissionReadinessQuery = Readonly<{
  operationRef: ProjectPreparationOperationRef;
  requesterRef: TrustedRequesterRef;
  tenantRef: TenantRef;
}>;

export type GetScopeAdmissionReadinessResult =
  | Readonly<{ kind: "found"; readiness: ScopeAdmissionReadiness }>
  | Readonly<{ kind: "not-found" }>
  | Readonly<{ kind: "denied"; dependency: string; reason: string }>
  | Readonly<{
      kind: "unavailable";
      dependency: string;
      reason: string;
      retryAfter?: Instant;
    }>;

export type DispatchManagedScopeAdmissionResult =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "retry" }>
  | Readonly<{ kind: "blocked" }>
  | Readonly<{ kind: "reconcile-required" }>
  | Readonly<{ kind: "receipt-recorded" }>
  | Readonly<{ kind: "integrity-conflict" }>
  | Readonly<{ kind: "stale" }>;

export type ReconcileManagedScopeAdmissionResult =
  | Readonly<{ kind: "not-found" }>
  | Readonly<{ kind: "unresolved" }>
  | Readonly<{ kind: "retry" }>
  | Readonly<{ kind: "blocked" }>
  | Readonly<{ kind: "cancelled" }>
  | Readonly<{ kind: "receipt-recorded" }>
  | Readonly<{ kind: "integrity-conflict" }>
  | Readonly<{ kind: "stale" }>;

export type RecheckScopeAdmissionAuthorityResult =
  | Readonly<{ kind: "idle" | "retry" | "ready" | "blocked" | "stale" }>
  | Readonly<{ kind: "integrity-conflict" }>;

export type CancelProjectPreparationResult =
  | Readonly<{ kind: "not-found" }>
  | Readonly<{
      kind: "cancelled" | "reconciliation-required" | "already-completed";
      replayed: boolean;
    }>
  | Readonly<{ kind: "stale" }>
  | Readonly<{ kind: "conflict"; reason: "COMMAND_DIGEST_MISMATCH" }>
  | Readonly<{ kind: "denied"; dependency: string; reason: string }>
  | Readonly<{
      kind: "unavailable";
      dependency: string;
      reason: string;
      retryAfter?: Instant;
    }>;

export type ResumeProjectPreparationResult =
  | Readonly<{
      kind: "accepted";
      generation: number;
      predecessorReceiptRetained: boolean;
      replayed: boolean;
    }>
  | Readonly<{ kind: "not-found" | "not-resumable" | "stale" }>
  | Readonly<{ kind: "conflict"; reason: "COMMAND_DIGEST_MISMATCH" }>
  | Readonly<{ kind: "denied"; dependency: string; reason: string }>
  | Readonly<{
      kind: "unavailable";
      dependency: string;
      reason: string;
      retryAfter?: Instant;
    }>;

export type ProjectManagementClock = Readonly<{ now(): Instant }>;

export type ProjectManagementIdGenerator = Readonly<{
  nextProjectId(): ProductProjectId;
  nextProcessId(): ManagedScopeAdmissionProcessId;
  nextOperationRef(): ProjectPreparationOperationRef;
  nextScopeCommandId(): ScopeAdmissionStepCommandId;
  nextOutboxId(): ScopeAdmissionOutboxId;
  nextLeaseId(): ScopeAdmissionLeaseId;
}>;

export type ProjectManagementDependencies = Readonly<{
  authorities: CreationAuthorityPorts;
  clock: ProjectManagementClock;
  dispatchLeaseDurationMs: number;
  maxPreparationGenerations: number;
  safeRetryPolicy: SafeRetryPolicy;
  digest: CanonicalDigestPort;
  ids: ProjectManagementIdGenerator;
  orchestrationScopeAdmission: OrchestrationScopeAdmissionPort;
  store: ProjectManagementStore;
}>;

export type ProjectManagementApplication = Readonly<{
  createProductProject(
    command: CreateProductProjectCommand,
  ): Promise<CreateProductProjectResult>;
  cancelProjectPreparation(
    command: ProjectPreparationCommand,
  ): Promise<CancelProjectPreparationResult>;
  resumeProjectPreparation(
    command: ProjectPreparationCommand,
  ): Promise<ResumeProjectPreparationResult>;
  getScopeAdmissionReadiness(
    query: GetScopeAdmissionReadinessQuery,
  ): Promise<GetScopeAdmissionReadinessResult>;
}>;

export type ProjectManagementWorker = Readonly<{
  dispatchManagedScopeAdmission(): Promise<DispatchManagedScopeAdmissionResult>;
  reconcileManagedScopeAdmission(
    operationRef: ProjectPreparationOperationRef,
  ): Promise<ReconcileManagedScopeAdmissionResult>;
  recheckScopeAdmissionAuthority(): Promise<RecheckScopeAdmissionAuthorityResult>;
}>;

export type ProjectManagementModule = Readonly<{
  application: ProjectManagementApplication;
  worker: ProjectManagementWorker;
}>;
