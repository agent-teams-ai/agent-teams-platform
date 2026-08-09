import type {
  ManagedScopeAdmissionProcess,
  ScopeAdmissionBlockReason,
} from "./managed-scope-admission-process.js";
import type { ProductProject } from "./product-project.js";
import type { ProjectAdmissionAuthority } from "./project-admission-authority.js";

export type ScopeAdmissionReadiness =
  | Readonly<{ kind: "ready" }>
  | Readonly<{
      kind: "preparing";
      reason:
        | "DISPATCH_PENDING"
        | "RETRY_WAIT"
        | "OUTCOME_UNKNOWN"
        | "AUTHORITY_RECHECK_PENDING";
    }>
  | Readonly<{
      kind: "blocked";
      reason:
        | ScopeAdmissionBlockReason
        | "PROJECT_RETIRED"
        | "UNKNOWN_BLOCK";
      recoverable: boolean;
      allowedActions: readonly ("resume" | "inspect" | "retire")[];
    }>;

export function scopeAdmissionReadiness(input: {
  project: ProductProject;
  admission: ProjectAdmissionAuthority;
  process: ManagedScopeAdmissionProcess;
  maxPreparationGenerations: number;
}): ScopeAdmissionReadiness {
  if (input.project.lifecycle !== "open") {
    return Object.freeze({
      kind: "blocked",
      reason: "PROJECT_RETIRED",
      recoverable: false,
      allowedActions: Object.freeze([]),
    });
  }
  if (input.process.state === "blocked") {
    const requiresSuccessorGeneration = input.process.receipt?.kind !== "admitted";
    const generationExhausted =
      input.process.resumptionCount >= input.maxPreparationGenerations ||
      (requiresSuccessorGeneration &&
        input.process.generation >= input.maxPreparationGenerations);
    const recoverable = !generationExhausted && ![
      "DATA_INTEGRITY_CONFLICT",
      "DOWNSTREAM_CONFLICT",
    ].includes(input.process.blockReason ?? "");
    return Object.freeze({
      kind: "blocked",
      reason: input.process.blockReason ?? "UNKNOWN_BLOCK",
      recoverable,
      allowedActions: Object.freeze(
        recoverable
          ? (["resume", "inspect", "retire"] as const)
          : (["inspect", "retire"] as const),
      ),
    });
  }
  if (
    input.process.state === "ready" &&
    input.process.admissionAuthorityBasis !== null &&
    input.process.receipt?.kind === "admitted" &&
    input.admission.state === "allowed" &&
    input.admission.basis.kind === "managed-scope-admitted" &&
    input.admission.basis.receiptRef === input.process.receipt.receiptRef
  ) {
    return Object.freeze({ kind: "ready" });
  }
  const reasonByState = {
    requested: "DISPATCH_PENDING",
    claimed: "DISPATCH_PENDING",
    "dispatch-committed": "OUTCOME_UNKNOWN",
    "retry-wait": "RETRY_WAIT",
    "reconcile-required": "OUTCOME_UNKNOWN",
    "cancel-reconcile-required": "OUTCOME_UNKNOWN",
    "receipt-observed": "AUTHORITY_RECHECK_PENDING",
    ready: "AUTHORITY_RECHECK_PENDING",
  } as const;
  return Object.freeze({
    kind: "preparing",
    reason: reasonByState[input.process.state],
  });
}
