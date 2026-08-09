import type {
  CreateProductProjectCommand,
  ProjectPreparationCommand,
} from "./contracts.js";
import type {
  CanonicalCommandDigest,
  ManagedScopeAdmissionProcessId,
  ProductProjectId,
  ScopeAdmissionStepCommandId,
  TenantRef,
} from "../domain/value-objects.js";

export interface CanonicalDigestPort {
  digest(canonicalPreimage: Uint8Array): CanonicalCommandDigest;
}

const encoder = new TextEncoder();

function canonicalBytes(fields: readonly (number | string)[]): Uint8Array {
  return encoder.encode(JSON.stringify(fields));
}

export function digestCreateProductProject(
  port: CanonicalDigestPort,
  command: CreateProductProjectCommand,
): CanonicalCommandDigest {
  return port.digest(canonicalBytes([
    "agent-teams.platform.project-management.create-product-project.v1",
    command.commandScope,
    command.commandId,
    command.requesterRef,
    command.tenantRef,
    command.displayName,
  ]));
}

export function digestPreparationCommand(
  port: CanonicalDigestPort,
  kind: "cancel" | "resume",
  command: ProjectPreparationCommand,
): CanonicalCommandDigest {
  return port.digest(canonicalBytes([
    `agent-teams.platform.project-management.${kind}-project-preparation.v1`,
    command.commandScope,
    command.commandId,
    command.operationRef,
    command.expectedGeneration,
    command.requesterRef,
    command.tenantRef,
  ]));
}

export function digestScopeAdmissionCommand(
  port: CanonicalDigestPort,
  input: Readonly<{
    tenantRef: TenantRef;
    projectId: ProductProjectId;
    projectIncarnation: number;
    processId: ManagedScopeAdmissionProcessId;
    generation: number;
    commandId: ScopeAdmissionStepCommandId;
  }>,
): CanonicalCommandDigest {
  return port.digest(canonicalBytes([
    "agent-teams.platform.project-management.admit-orchestration-scope.v1",
    input.tenantRef,
    input.projectId,
    input.projectIncarnation,
    input.processId,
    input.generation,
    input.commandId,
  ]));
}
