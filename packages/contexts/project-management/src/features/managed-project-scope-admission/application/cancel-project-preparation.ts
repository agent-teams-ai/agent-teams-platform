import type {
  CancelProjectPreparationResult,
  ProjectPreparationCommand,
  ProjectManagementDependencies,
} from "./contracts.js";
import { evaluatePreparationAuthority } from "./evaluate-preparation-authority.js";
import { digestPreparationCommand } from "./canonical-command-digests.js";

export function cancelProjectPreparationUseCase(
  dependencies: ProjectManagementDependencies,
): (
  command: ProjectPreparationCommand,
) => Promise<CancelProjectPreparationResult> {
  return async (command) => {
    const identity = {
      commandScope: command.commandScope,
      commandId: command.commandId,
      commandDigest: digestPreparationCommand(dependencies.digest, "cancel", command),
    } as const;
    const prior = await dependencies.store.loadPreparationCommandReceipt(
      command.commandScope,
      command.commandId,
    );
    if (prior !== null) {
      const replay = await dependencies.store.cancelPreparation({
        identity,
        operationRef: command.operationRef,
        expectedGeneration: command.expectedGeneration,
        authorityValidUntil: Number.MAX_SAFE_INTEGER,
      });
      if (replay.kind === "conflict") {
        return { kind: "conflict", reason: "COMMAND_DIGEST_MISMATCH" };
      }
      if (replay.kind === "not-found") {
        return { kind: "not-found" };
      }
      if (replay.kind === "stale") {
        return { kind: "stale" };
      }
      return { kind: replay.outcome, replayed: replay.replayed };
    }
    const snapshot = await dependencies.store.loadByOperation(command.operationRef);
    if (snapshot === null || snapshot.project.tenantRef !== command.tenantRef) {
      return { kind: "not-found" };
    }
    const authority = await evaluatePreparationAuthority({
      port: dependencies.authorities.preparationControl,
      query: {
        action: "cancel",
        operationRef: command.operationRef,
        projectId: snapshot.project.id,
        requesterRef: command.requesterRef,
        tenantRef: command.tenantRef,
      },
      now: () => dependencies.clock.now(),
    });
    if (authority.kind !== "allowed") {
      return authority;
    }
    const result = await dependencies.store.cancelPreparation({
      identity,
      operationRef: command.operationRef,
      expectedGeneration: command.expectedGeneration,
      authorityValidUntil: authority.validUntil,
    });
    if (result.kind === "conflict") {
      return { kind: "conflict", reason: "COMMAND_DIGEST_MISMATCH" };
    }
    if (result.kind === "not-found") {
      return { kind: "not-found" };
    }
    if (result.kind === "stale") {
      return { kind: "stale" };
    }
    return { kind: result.outcome, replayed: result.replayed };
  };
}
