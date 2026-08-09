import type {
  Instant,
  OpaqueAuthorityEvidenceRef,
  OpaqueAuthorityRevision,
  ProductProjectId,
  ProjectPreparationOperationRef,
  TenantRef,
  TrustedRequesterRef,
} from "../../domain/value-objects.js";

export type AuthorityDecision =
  | Readonly<{
      kind: "allowed";
      evidenceRef: OpaqueAuthorityEvidenceRef;
      revision: OpaqueAuthorityRevision;
      validUntil: Instant;
    }>
  | Readonly<{ kind: "denied"; reason: string }>
  | Readonly<{ kind: "stale"; reason: string }>
  | Readonly<{ kind: "indeterminate"; reason: string }>
  | Readonly<{
      kind: "unavailable";
      reason: string;
      retryAfter?: Instant;
    }>;

export type ProjectCreationAuthorityQuery = Readonly<{
  tenantRef: TenantRef;
  requesterRef: TrustedRequesterRef;
}>;

export interface TenantProjectAdmissionPort {
  decide(query: ProjectCreationAuthorityQuery): Promise<AuthorityDecision>;
}

export interface CreateProductProjectAuthorityPort {
  decide(query: ProjectCreationAuthorityQuery): Promise<AuthorityDecision>;
}

export interface CommercialProjectCreationAuthorityPort {
  decide(query: ProjectCreationAuthorityQuery): Promise<AuthorityDecision>;
}

export type ProjectPreparationAuthorityQuery = Readonly<{
  action: "cancel" | "resume" | "read-readiness";
  operationRef: ProjectPreparationOperationRef;
  projectId: ProductProjectId;
  requesterRef: TrustedRequesterRef;
  tenantRef: TenantRef;
}>;

export interface ProjectPreparationAuthorityPort {
  decide(query: ProjectPreparationAuthorityQuery): Promise<AuthorityDecision>;
}

export type CreationAuthorityPorts = Readonly<{
  tenantAdmission: TenantProjectAdmissionPort;
  projectCreation: CreateProductProjectAuthorityPort;
  commercialCreation: CommercialProjectCreationAuthorityPort;
  preparationControl: ProjectPreparationAuthorityPort;
}>;
