import { resumeManagedScopeAdmission } from "../domain/managed-scope-admission-process.js";
import type {
  ProjectPreparationCommand,
  ProjectManagementDependencies,
  ResumeProjectPreparationResult,
} from "./contracts.js";
import { evaluateCreationAuthority } from "./evaluate-creation-authority.js";
import { evaluatePreparationAuthority } from "./evaluate-preparation-authority.js";
import type { PreparationCommandReceipt } from "./ports/project-management-store.js";
import { digestPreparationCommand, digestScopeAdmissionCommand } from "./canonical-command-digests.js";

function replayedResume(
  prior: PreparationCommandReceipt | null,
  commandDigest: PreparationCommandReceipt["identity"]["commandDigest"],
): ResumeProjectPreparationResult | null {
  if (prior === null) {
    return null;
  }
  if (
    prior.identity.commandDigest !== commandDigest ||
    prior.kind !== "resume" ||
    prior.outcome.kind !== "resume"
  ) {
    return { kind: "conflict", reason: "COMMAND_DIGEST_MISMATCH" };
  }
  return {
    kind: "accepted",
    generation: prior.outcome.generation,
    predecessorReceiptRetained: prior.outcome.predecessorReceiptRetained,
    replayed: true,
  };
}

function isResumable(
  process: Awaited<ReturnType<ProjectManagementDependencies["store"]["loadByOperation"]>>,
  command: ProjectPreparationCommand,
  maxGenerations: number,
): boolean {
  const canReuseAdmittedReceipt = process?.process.receipt?.kind === "admitted";
  return process !== null &&
    process.process.state === "blocked" &&
    process.process.blockReason !== "DATA_INTEGRITY_CONFLICT" &&
    process.process.blockReason !== "DOWNSTREAM_CONFLICT" &&
    process.process.generation === command.expectedGeneration &&
    process.process.resumptionCount < maxGenerations &&
    (canReuseAdmittedReceipt || process.process.generation < maxGenerations);
}

export function resumeProjectPreparationUseCase(
  dependencies: ProjectManagementDependencies,
): (
  command: ProjectPreparationCommand,
) => Promise<ResumeProjectPreparationResult> {
  return async (command) => {
    const commandDigest = digestPreparationCommand(
      dependencies.digest,
      "resume",
      command,
    );
    const prior = await dependencies.store.loadPreparationCommandReceipt(
      command.commandScope,
      command.commandId,
    );
    const replay = replayedResume(prior, commandDigest);
    if (replay !== null) {
      return replay;
    }
    const expected = await dependencies.store.loadByOperation(command.operationRef);
    if (expected === null) {
      return { kind: "not-found" };
    }
    if (expected.project.tenantRef !== command.tenantRef) {
      return { kind: "not-found" };
    }
    if (!isResumable(expected, command, dependencies.maxPreparationGenerations)) {
      return { kind: "not-resumable" };
    }
    const operationAuthority = await evaluatePreparationAuthority({
      port: dependencies.authorities.preparationControl,
      query: {
        action: "resume",
        operationRef: command.operationRef,
        projectId: expected.project.id,
        requesterRef: command.requesterRef,
        tenantRef: command.tenantRef,
      },
      now: () => dependencies.clock.now(),
    });
    if (operationAuthority.kind !== "allowed") {
      return operationAuthority;
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

    const predecessorReceiptRetained = expected.process.receipt?.kind === "admitted";
    const generation = predecessorReceiptRetained
      ? expected.process.generation
      : expected.process.generation + 1;
    const stepCommandId = predecessorReceiptRetained
      ? undefined
      : dependencies.ids.nextScopeCommandId();
    const stepDigest = stepCommandId === undefined
      ? undefined
      : digestScopeAdmissionCommand(dependencies.digest, {
          tenantRef: expected.project.tenantRef,
          projectId: expected.project.id,
          projectIncarnation: expected.project.incarnation,
          processId: expected.process.id,
          generation,
          commandId: stepCommandId,
        });
    const successor = resumeManagedScopeAdmission(
      expected.process,
      stepCommandId === undefined || stepDigest === undefined
        ? {
            creationAuthorityBasis: authority.basis,
            requesterRef: command.requesterRef,
          }
        : {
            creationAuthorityBasis: authority.basis,
            requesterRef: command.requesterRef,
            stepCommandId,
            stepDigest,
          },
    );
    const now = dependencies.clock.now();
    const result = await dependencies.store.resumePreparation({
      identity: {
        commandScope: command.commandScope,
        commandId: command.commandId,
        commandDigest,
      },
      expected,
      successor,
      outbox: predecessorReceiptRetained
        ? null
        : Object.freeze({
            id: dependencies.ids.nextOutboxId(),
            processId: successor.id,
            processGeneration: successor.generation,
            stepCommandId: successor.stepCommandId,
            stepDigest: successor.stepDigest,
            state: "pending",
            notBefore: now,
            leaseId: null,
            leaseExpiresAt: null,
          }),
      maxGenerations: dependencies.maxPreparationGenerations,
      operationAuthorityValidUntil: operationAuthority.validUntil,
    });
    if (result.kind === "authority-expired") {
      return {
        kind: "unavailable",
        dependency: "creation-authority-basis",
        reason: "AUTHORITY_EVIDENCE_EXPIRED",
      };
    }
    if (result.kind === "conflict") {
      return { kind: "conflict", reason: "COMMAND_DIGEST_MISMATCH" };
    }
    return result.kind === "applied"
      ? {
          kind: "accepted",
          generation: result.generation,
          predecessorReceiptRetained: result.predecessorReceiptRetained,
          replayed: result.replayed,
        }
      : {
          kind: result.kind === "generation-limit" ? "not-resumable" : "stale",
        };
  };
}
