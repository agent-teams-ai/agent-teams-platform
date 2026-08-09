import { requestManagedScopeAdmission } from "../domain/managed-scope-admission-process.js";
import { createProductProject as createProject } from "../domain/product-project.js";
import { denyProjectAdmission } from "../domain/project-admission-authority.js";
import { projectDisplayName } from "../domain/value-objects.js";
import type {
  CreateProductProjectCommand,
  CreateProductProjectResult,
  ProjectManagementDependencies,
} from "./contracts.js";
import { evaluateCreationAuthority } from "./evaluate-creation-authority.js";
import {
  digestCreateProductProject,
  digestScopeAdmissionCommand,
} from "./canonical-command-digests.js";

export function createProductProjectUseCase(
  dependencies: ProjectManagementDependencies,
): (command: CreateProductProjectCommand) => Promise<CreateProductProjectResult> {
  return async (command) => {
    try {
      projectDisplayName(command.displayName);
    } catch (error) {
      return {
        kind: "invalid",
        issues: Object.freeze([
          error instanceof Error ? error.message : "Invalid Project display name.",
        ]),
      };
    }

    const commandDigest = digestCreateProductProject(dependencies.digest, command);
    const priorReceipt = await dependencies.store.loadCreationReceipt(
      command.commandScope,
      command.commandId,
    );
    if (priorReceipt !== null) {
      if (priorReceipt.commandDigest !== commandDigest) {
        return { kind: "conflict", reason: "COMMAND_DIGEST_MISMATCH" };
      }
      return {
        kind: "accepted",
        projectId: priorReceipt.projectId,
        operationRef: priorReceipt.operationRef,
        replayed: true,
      };
    }
    const authority = await evaluateCreationAuthority({
      ports: dependencies.authorities,
      query: {
        tenantRef: command.tenantRef,
        requesterRef: command.requesterRef,
      },
      now: () => dependencies.clock.now(),
    });
    if (authority.kind !== "allowed") {
      return authority;
    }

    const project = createProject({
      id: dependencies.ids.nextProjectId(),
      tenantRef: command.tenantRef,
      displayName: command.displayName,
    });
    const processId = dependencies.ids.nextProcessId();
    const stepCommandId = dependencies.ids.nextScopeCommandId();
    const process = requestManagedScopeAdmission({
      id: processId,
      operationRef: dependencies.ids.nextOperationRef(),
      projectId: project.id,
      tenantRef: project.tenantRef,
      requesterRef: command.requesterRef,
      stepCommandId,
      stepDigest: digestScopeAdmissionCommand(dependencies.digest, {
        tenantRef: project.tenantRef,
        projectId: project.id,
        projectIncarnation: project.incarnation,
        processId,
        generation: 1,
        commandId: stepCommandId,
      }),
      creationAuthorityBasis: authority.basis,
    });
    const acceptedAt = dependencies.clock.now();
    if (acceptedAt >= authority.basis.validUntil) {
      return {
        kind: "unavailable",
        dependency: "creation-authority-basis",
        reason: "AUTHORITY_EVIDENCE_EXPIRED",
      };
    }
    const receipt = Object.freeze({
      commandScope: command.commandScope,
      commandId: command.commandId,
      commandDigest,
      projectId: project.id,
      operationRef: process.operationRef,
      acceptedAt,
    });
    const result = await dependencies.store.commitCreation({
      project,
      admission: denyProjectAdmission(project.id),
      process,
      receipt,
      outbox: Object.freeze({
        id: dependencies.ids.nextOutboxId(),
        processId: process.id,
        processGeneration: process.generation,
        stepCommandId: process.stepCommandId,
        stepDigest: process.stepDigest,
        state: "pending",
        notBefore: acceptedAt,
        leaseId: null,
        leaseExpiresAt: null,
      }),
    });
    if (result.kind === "conflict") {
      return { kind: "conflict", reason: "COMMAND_DIGEST_MISMATCH" };
    }
    if (result.kind === "authority-expired") {
      return {
        kind: "unavailable",
        dependency: "creation-authority-basis",
        reason: "AUTHORITY_EVIDENCE_EXPIRED",
      };
    }
    return {
      kind: "accepted",
      projectId: result.receipt.projectId,
      operationRef: result.receipt.operationRef,
      replayed: result.kind === "replayed",
    };
  };
}
