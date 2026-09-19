import { InMemoryProjectManagementStore } from "../../adapters/in-memory/in-memory-project-management-store.js";
import {
  createProjectManagementModule,
  ids,
  type AuthorityDecision,
  type OrchestrationScopeAdmissionPort,
  type ProjectManagementDependencies,
  type ScopeAdmissionIntent,
  type ScopeAdmissionRecovery,
  type ScopeAdmissionSubmission,
} from "../../composition.js";
import type {
  CreateProductProjectCommand,
  ProjectPreparationCommand,
} from "../../public.js";

export const NOW = 1_800_000_000_000;

export class AuthorityFake {
  afterDecision: (() => void) | null = null;
  calls = 0;
  fails = false;
  decision: AuthorityDecision = {
    kind: "allowed",
    evidenceRef: ids.authorityEvidence("evidence-1"),
    revision: ids.authorityRevision("revision-1"),
    validUntil: NOW + 60_000,
  };

  async decide(): Promise<AuthorityDecision> {
    this.calls += 1;
    if (this.fails) {
      throw new Error("authority transport failed");
    }
    this.afterDecision?.();
    return this.decision;
  }
}

export class OrchestrationScopeFake implements OrchestrationScopeAdmissionPort {
  submissions: ScopeAdmissionIntent[] = [];
  recoveries: ScopeAdmissionIntent[] = [];
  submission: (
    intent: ScopeAdmissionIntent,
  ) => ScopeAdmissionSubmission | Promise<ScopeAdmissionSubmission> =
    (intent) => ({
      kind: "receipt",
      receipt: {
        kind: "admitted",
        receiptRef: ids.orchestratorReceipt("orchestrator-receipt-1"),
        receiptDigest: intent.commandDigest,
      },
    });
  recovery: (intent: ScopeAdmissionIntent) => ScopeAdmissionRecovery = () => ({
    kind: "unresolved",
  });

  async submit(intent: ScopeAdmissionIntent): Promise<ScopeAdmissionSubmission> {
    this.submissions.push(intent);
    return await this.submission(intent);
  }

  async recover(intent: ScopeAdmissionIntent): Promise<ScopeAdmissionRecovery> {
    this.recoveries.push(intent);
    return this.recovery(intent);
  }
}

function sequentialIds(): ProjectManagementDependencies["ids"] {
  let sequence = 0;
  const next = (prefix: string) => `${prefix}-${++sequence}`;
  return {
    nextProjectId: () => ids.project(next("project")),
    nextProcessId: () => ids.process(next("process")),
    nextOperationRef: () => ids.operation(next("operation")),
    nextScopeCommandId: () => ids.scopeCommand(next("scope-command")),
    nextOutboxId: () => ids.outbox(next("outbox")),
    nextLeaseId: () => ids.lease(next("lease")),
  };
}

export function command(
  displayName = "Alpha Project",
  commandId = "create-1",
): CreateProductProjectCommand {
  return {
    commandScope: ids.commandScope("tenant-1:user-1"),
    commandId: ids.createCommand(commandId),
    requesterRef: ids.requester("user-1"),
    tenantRef: ids.tenant("tenant-1"),
    displayName,
  };
}

export function cancelCommand(
  operationRef: ReturnType<typeof ids.operation>,
  expectedGeneration = 1,
  commandId = `cancel-${expectedGeneration}`,
): ProjectPreparationCommand {
  return {
    commandScope: ids.commandScope("tenant-1:user-1"),
    commandId: ids.preparationCommand(commandId),
    operationRef,
    expectedGeneration,
    requesterRef: ids.requester("user-1"),
    tenantRef: ids.tenant("tenant-1"),
  };
}

export function resumeCommand(
  operationRef: ReturnType<typeof ids.operation>,
  expectedGeneration = 1,
  commandId = `resume-${expectedGeneration}`,
): ProjectPreparationCommand {
  return {
    commandScope: ids.commandScope("tenant-1:user-1"),
    commandId: ids.preparationCommand(commandId),
    operationRef,
    expectedGeneration,
    requesterRef: ids.requester("user-1"),
    tenantRef: ids.tenant("tenant-1"),
  };
}

export function fixture(options: {
  dispatchLeaseDurationMs?: number;
  idGenerator?: ProjectManagementDependencies["ids"];
  maxPreparationGenerations?: number;
  safeRetryPolicy?: ProjectManagementDependencies["safeRetryPolicy"];
} = {}) {
  const clock = {
    current: NOW,
    now() {
      return this.current;
    },
  };
  const store = new InMemoryProjectManagementStore(clock);
  const tenantAuthority = new AuthorityFake();
  const projectAuthority = new AuthorityFake();
  const commercialAuthority = new AuthorityFake();
  const preparationAuthority = new AuthorityFake();
  const orchestration = new OrchestrationScopeFake();
  const dependencies: ProjectManagementDependencies = {
    authorities: {
      tenantAdmission: tenantAuthority,
      projectCreation: projectAuthority,
      commercialCreation: commercialAuthority,
      preparationControl: preparationAuthority,
    },
    clock,
    dispatchLeaseDurationMs: options.dispatchLeaseDurationMs ?? 1000,
    safeRetryPolicy: options.safeRetryPolicy ?? {
      defaultDelayMs: 1000,
      maxDelayMs: 60_000,
      maxAttempts: 2,
    },
    maxPreparationGenerations: options.maxPreparationGenerations ?? 4,
    digest: {
      digest: (preimage) => ids.digest(new TextDecoder().decode(preimage)),
    },
    ids: options.idGenerator ?? sequentialIds(),
    orchestrationScopeAdmission: orchestration,
    store,
  };
  return {
    ...createProjectManagementModule(dependencies),
    commercialAuthority,
    orchestration,
    projectAuthority,
    preparationAuthority,
    setNow: (value: number) => {
      clock.current = value;
    },
    store,
    tenantAuthority,
  };
}

export async function acceptedProject(subject: ReturnType<typeof fixture>) {
  const result = await subject.application.createProductProject(command());
  if (result.kind !== "accepted") {
    throw new Error("Expected Project creation to be accepted.");
  }
  return result;
}

export type ModelConformanceSubject = ReturnType<typeof fixture>;
