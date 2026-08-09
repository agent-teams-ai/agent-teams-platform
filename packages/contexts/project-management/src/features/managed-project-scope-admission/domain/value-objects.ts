declare const brand: unique symbol;

type Brand<TValue, TName extends string> = TValue & {
  readonly [brand]: TName;
};

export type ProductProjectId = Brand<string, "ProductProjectId">;
export type TenantRef = Brand<string, "TenantRef">;
export type TrustedRequesterRef = Brand<string, "TrustedRequesterRef">;
export type CommandScope = Brand<string, "CommandScope">;
export type CreateProductProjectCommandId = Brand<
  string,
  "CreateProductProjectCommandId"
>;
export type ProjectPreparationCommandId = Brand<
  string,
  "ProjectPreparationCommandId"
>;
export type CanonicalCommandDigest = Brand<string, "CanonicalCommandDigest">;
export type ManagedScopeAdmissionProcessId = Brand<
  string,
  "ManagedScopeAdmissionProcessId"
>;
export type ProjectPreparationOperationRef = Brand<
  string,
  "ProjectPreparationOperationRef"
>;
export type ScopeAdmissionStepCommandId = Brand<
  string,
  "ScopeAdmissionStepCommandId"
>;
export type ScopeAdmissionOutboxId = Brand<string, "ScopeAdmissionOutboxId">;
export type OpaqueAuthorityEvidenceRef = Brand<
  string,
  "OpaqueAuthorityEvidenceRef"
>;
export type OpaqueAuthorityRevision = Brand<
  string,
  "OpaqueAuthorityRevision"
>;
export type OpaqueOrchestratorReceiptRef = Brand<
  string,
  "OpaqueOrchestratorReceiptRef"
>;
export type ScopeAdmissionLeaseId = Brand<string, "ScopeAdmissionLeaseId">;

export type Instant = number;
export type ProductProjectIncarnation = number;
export type AggregateRevision = number;
export type ProcessGeneration = number;

function nonEmpty<TName extends string>(value: string, name: TName): Brand<string, TName> {
  if (value.length === 0) {
    throw new TypeError(`${name} cannot be empty.`);
  }
  return value as Brand<string, TName>;
}

export const ids = {
  project: (value: string) => nonEmpty(value, "ProductProjectId"),
  tenant: (value: string) => nonEmpty(value, "TenantRef"),
  requester: (value: string) => nonEmpty(value, "TrustedRequesterRef"),
  commandScope: (value: string) => nonEmpty(value, "CommandScope"),
  createCommand: (value: string) =>
    nonEmpty(value, "CreateProductProjectCommandId"),
  preparationCommand: (value: string) =>
    nonEmpty(value, "ProjectPreparationCommandId"),
  digest: (value: string) => nonEmpty(value, "CanonicalCommandDigest"),
  process: (value: string) => nonEmpty(value, "ManagedScopeAdmissionProcessId"),
  operation: (value: string) =>
    nonEmpty(value, "ProjectPreparationOperationRef"),
  scopeCommand: (value: string) => nonEmpty(value, "ScopeAdmissionStepCommandId"),
  outbox: (value: string) => nonEmpty(value, "ScopeAdmissionOutboxId"),
  authorityEvidence: (value: string) =>
    nonEmpty(value, "OpaqueAuthorityEvidenceRef"),
  authorityRevision: (value: string) =>
    nonEmpty(value, "OpaqueAuthorityRevision"),
  orchestratorReceipt: (value: string) =>
    nonEmpty(value, "OpaqueOrchestratorReceiptRef"),
  lease: (value: string) => nonEmpty(value, "ScopeAdmissionLeaseId"),
} as const;

export function projectDisplayName(value: string): string {
  if (value.trim().length === 0) {
    throw new TypeError("Project display name cannot be blank.");
  }
  return value;
}

export function nextRevision(current: number): number {
  if (!Number.isSafeInteger(current) || current < 1) {
    throw new TypeError("Revision must be a positive safe integer.");
  }
  return current + 1;
}
