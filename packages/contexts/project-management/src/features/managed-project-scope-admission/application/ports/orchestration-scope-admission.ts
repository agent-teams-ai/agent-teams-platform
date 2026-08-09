import type { ScopeAdmissionReceipt } from "../../domain/managed-scope-admission-process.js";
import type { CreationAuthorityBasisSnapshot } from "../../domain/creation-authority-basis.js";
import type {
  CanonicalCommandDigest,
  Instant,
  ManagedScopeAdmissionProcessId,
  ProcessGeneration,
  ProductProjectId,
  ProductProjectIncarnation,
  ScopeAdmissionLeaseId,
  ScopeAdmissionStepCommandId,
  TenantRef,
} from "../../domain/value-objects.js";

export type ScopeAdmissionIntent = Readonly<{
  tenantRef: TenantRef;
  projectId: ProductProjectId;
  projectIncarnation: ProductProjectIncarnation;
  processId: ManagedScopeAdmissionProcessId;
  processGeneration: ProcessGeneration;
  commandId: ScopeAdmissionStepCommandId;
  commandDigest: CanonicalCommandDigest;
  dispatchAuthority: CreationAuthorityBasisSnapshot;
  dispatchLease: Readonly<{
    leaseId: ScopeAdmissionLeaseId;
    validUntil: Instant;
  }>;
}>;

export type ScopeAdmissionRecoveryQuery = Readonly<{
  tenantRef: TenantRef;
  projectId: ProductProjectId;
  projectIncarnation: ProductProjectIncarnation;
  processId: ManagedScopeAdmissionProcessId;
  processGeneration: ProcessGeneration;
  commandId: ScopeAdmissionStepCommandId;
  commandDigest: CanonicalCommandDigest;
}>;

export type ScopeAdmissionSubmission =
  | Readonly<{ kind: "receipt"; receipt: ScopeAdmissionReceipt }>
  | Readonly<{ kind: "not-submitted"; retryAfter?: number }>
  | Readonly<{ kind: "outcome-unknown" }>;

export type ScopeAdmissionRecovery =
  | Readonly<{ kind: "receipt"; receipt: ScopeAdmissionReceipt }>
  | Readonly<{ kind: "known-not-accepted"; retryAfter?: number }>
  | Readonly<{ kind: "unresolved" }>;

export interface OrchestrationScopeAdmissionPort {
  /**
   * The adapter must reject as not-submitted when dispatchAuthority or
   * dispatchLease expires before the first externally visible byte or process
   * side effect.
   */
  submit(intent: ScopeAdmissionIntent): Promise<ScopeAdmissionSubmission>;
  recover(query: ScopeAdmissionRecoveryQuery): Promise<ScopeAdmissionRecovery>;
}
