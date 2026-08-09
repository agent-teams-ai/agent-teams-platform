import type { CreationAuthorityBasisSnapshot } from "./creation-authority-basis.js";
import type {
  CanonicalCommandDigest,
  ManagedScopeAdmissionProcessId,
  OpaqueOrchestratorReceiptRef,
  ProcessGeneration,
  ProductProjectId,
  ProjectPreparationOperationRef,
  ScopeAdmissionStepCommandId,
  TenantRef,
  TrustedRequesterRef,
} from "./value-objects.js";

export type ScopeAdmissionReceipt = Readonly<{
  kind: "admitted" | "rejected" | "stale" | "conflict";
  receiptRef: OpaqueOrchestratorReceiptRef;
  receiptDigest: CanonicalCommandDigest;
  reason?: string;
}>;

export type ScopeAdmissionBlockReason =
  | "AUTHORITY_DENIED"
  | "AUTHORITY_RECHECK_EXHAUSTED"
  | "COMMERCIAL_RESTRICTION"
  | "DOWNSTREAM_REJECTED"
  | "DOWNSTREAM_STALE"
  | "DOWNSTREAM_CONFLICT"
  | "SAFE_RETRY_EXHAUSTED"
  | "USER_CANCELLED"
  | "DATA_INTEGRITY_CONFLICT";

export type ManagedScopeAdmissionState =
  | "requested"
  | "claimed"
  | "dispatch-committed"
  | "retry-wait"
  | "reconcile-required"
  | "cancel-reconcile-required"
  | "receipt-observed"
  | "ready"
  | "blocked";

export type ManagedScopeAdmissionProcess = Readonly<{
  id: ManagedScopeAdmissionProcessId;
  operationRef: ProjectPreparationOperationRef;
  projectId: ProductProjectId;
  tenantRef: TenantRef;
  requesterRef: TrustedRequesterRef;
  generation: ProcessGeneration;
  revision: number;
  state: ManagedScopeAdmissionState;
  stepCommandId: ScopeAdmissionStepCommandId;
  stepDigest: CanonicalCommandDigest;
  attemptCount: number;
  receipt: ScopeAdmissionReceipt | null;
  blockReason: ScopeAdmissionBlockReason | null;
  creationAuthorityBasis: CreationAuthorityBasisSnapshot;
  dispatchAuthorityBasis: CreationAuthorityBasisSnapshot | null;
  admissionAuthorityBasis: CreationAuthorityBasisSnapshot | null;
}>;

export function requestManagedScopeAdmission(input: {
  id: ManagedScopeAdmissionProcessId;
  operationRef: ProjectPreparationOperationRef;
  projectId: ProductProjectId;
  tenantRef: TenantRef;
  requesterRef: TrustedRequesterRef;
  stepCommandId: ScopeAdmissionStepCommandId;
  stepDigest: CanonicalCommandDigest;
  creationAuthorityBasis: CreationAuthorityBasisSnapshot;
}): ManagedScopeAdmissionProcess {
  return Object.freeze({
    ...input,
    generation: 1,
    revision: 1,
    state: "requested",
    attemptCount: 0,
    receipt: null,
    blockReason: null,
    dispatchAuthorityBasis: null,
    admissionAuthorityBasis: null,
  });
}

function evolve(
  process: ManagedScopeAdmissionProcess,
  update: Partial<ManagedScopeAdmissionProcess>,
): ManagedScopeAdmissionProcess {
  return Object.freeze({ ...process, ...update, revision: process.revision + 1 });
}

export function claimDispatch(
  process: ManagedScopeAdmissionProcess,
): ManagedScopeAdmissionProcess {
  if (process.state !== "requested" && process.state !== "retry-wait") {
    throw new Error(`Cannot claim dispatch from ${process.state}.`);
  }
  return evolve(process, {
    state: "claimed",
    attemptCount: process.attemptCount + 1,
  });
}

export function authorizeDispatch(
  process: ManagedScopeAdmissionProcess,
  basis: CreationAuthorityBasisSnapshot,
): ManagedScopeAdmissionProcess {
  if (process.state !== "claimed") {
    throw new Error("Only a claimed dispatch can receive last-mile authority.");
  }
  return evolve(process, {
    state: "dispatch-committed",
    dispatchAuthorityBasis: basis,
  });
}

export function blockScopeAdmissionForIntegrity(
  process: ManagedScopeAdmissionProcess,
): ManagedScopeAdmissionProcess {
  return evolve(process, {
    state: "blocked",
    blockReason: "DATA_INTEGRITY_CONFLICT",
  });
}

export function releaseUnsubmittedDispatch(
  process: ManagedScopeAdmissionProcess,
  exhausted: boolean,
  exhaustedReason: ScopeAdmissionBlockReason = "SAFE_RETRY_EXHAUSTED",
): ManagedScopeAdmissionProcess {
  if (process.state !== "claimed" && process.state !== "dispatch-committed") {
    throw new Error("Only an unsubmitted dispatch can be released.");
  }
  return evolve(process, {
    state: exhausted ? "blocked" : "retry-wait",
    blockReason: exhausted ? exhaustedReason : null,
    dispatchAuthorityBasis: null,
  });
}

export function requireReconciliation(
  process: ManagedScopeAdmissionProcess,
): ManagedScopeAdmissionProcess {
  if (process.state !== "dispatch-committed") {
    throw new Error("Only a committed dispatch can become uncertain.");
  }
  return evolve(process, { state: "reconcile-required" });
}

export function observeScopeAdmissionReceipt(
  process: ManagedScopeAdmissionProcess,
  receipt: ScopeAdmissionReceipt,
): ManagedScopeAdmissionProcess {
  if (process.receipt !== null) {
    if (
      process.receipt.receiptRef === receipt.receiptRef &&
      process.receipt.receiptDigest === receipt.receiptDigest &&
      process.receipt.kind === receipt.kind
    ) {
      return process;
    }
    return evolve(process, {
      state: "blocked",
      blockReason: "DATA_INTEGRITY_CONFLICT",
    });
  }
  if (!["dispatch-committed", "reconcile-required"].includes(process.state)) {
    throw new Error(`Cannot observe a receipt from ${process.state}.`);
  }
  if (receipt.kind === "admitted") {
    return evolve(process, {
      state: "receipt-observed",
      receipt,
    });
  }
  const reasonByKind = {
    rejected: "DOWNSTREAM_REJECTED",
    stale: "DOWNSTREAM_STALE",
    conflict: "DOWNSTREAM_CONFLICT",
  } as const;
  return evolve(process, {
    state: "blocked",
    receipt,
    blockReason: reasonByKind[receipt.kind],
  });
}

export function finalizeScopeAdmission(
  process: ManagedScopeAdmissionProcess,
  basis: CreationAuthorityBasisSnapshot,
): ManagedScopeAdmissionProcess {
  if (process.state !== "receipt-observed" || process.receipt?.kind !== "admitted") {
    throw new Error("Only an admitted receipt can finalize scope admission.");
  }
  return evolve(process, { state: "ready", admissionAuthorityBasis: basis });
}

export function blockScopeAdmissionForAuthority(
  process: ManagedScopeAdmissionProcess,
  reason: "AUTHORITY_DENIED" | "COMMERCIAL_RESTRICTION",
): ManagedScopeAdmissionProcess {
  if (process.state !== "receipt-observed") {
    throw new Error("Authority can block only an observed admitted receipt.");
  }
  return evolve(process, {
    state: "blocked",
    blockReason: reason,
  });
}

export function blockScopeAdmissionForAuthorityRecheckExhaustion(
  process: ManagedScopeAdmissionProcess,
  reason: "AUTHORITY_RECHECK_EXHAUSTED" | "COMMERCIAL_RESTRICTION",
): ManagedScopeAdmissionProcess {
  if (process.state !== "receipt-observed") {
    throw new Error("Only a pending authority recheck can exhaust its retry budget.");
  }
  return evolve(process, {
    state: "blocked",
    blockReason: reason,
  });
}


export function blockDispatchForAuthority(
  process: ManagedScopeAdmissionProcess,
  reason: "AUTHORITY_DENIED" | "COMMERCIAL_RESTRICTION",
): ManagedScopeAdmissionProcess {
  if (process.state !== "claimed") {
    throw new Error("Only a claimed dispatch can be denied by last-mile authority.");
  }
  return evolve(process, {
    state: "blocked",
    blockReason: reason,
    dispatchAuthorityBasis: null,
  });
}

export function releaseReconciledNonAcceptance(
  process: ManagedScopeAdmissionProcess,
  exhausted: boolean,
): ManagedScopeAdmissionProcess {
  if (process.state !== "reconcile-required") {
    throw new Error("Only an uncertain dispatch can prove non-acceptance.");
  }
  return evolve(process, {
    state: exhausted ? "blocked" : "retry-wait",
    blockReason: exhausted ? "SAFE_RETRY_EXHAUSTED" : null,
    dispatchAuthorityBasis: null,
  });
}

export type ScopeAdmissionCancellationTransition = Readonly<{
  process: ManagedScopeAdmissionProcess;
  outcome: "cancelled" | "reconciliation-required" | "already-completed";
}>;

function cancelled(process: ManagedScopeAdmissionProcess): ManagedScopeAdmissionProcess {
  return evolve(process, {
    state: "blocked",
    blockReason: "USER_CANCELLED",
    dispatchAuthorityBasis: null,
  });
}

export function requestScopeAdmissionCancellation(
  process: ManagedScopeAdmissionProcess,
): ScopeAdmissionCancellationTransition {
  if (process.state === "ready") {
    return { process, outcome: "already-completed" };
  }
  if (
    process.state === "blocked" &&
    (process.blockReason === "DATA_INTEGRITY_CONFLICT" ||
      process.blockReason === "DOWNSTREAM_CONFLICT")
  ) {
    return { process, outcome: "already-completed" };
  }
  if (process.state === "blocked" && process.blockReason === "USER_CANCELLED") {
    return { process, outcome: "cancelled" };
  }
  if (process.state === "cancel-reconcile-required") {
    return { process, outcome: "reconciliation-required" };
  }
  if (process.state === "dispatch-committed" || process.state === "reconcile-required") {
    return {
      process: evolve(process, { state: "cancel-reconcile-required" }),
      outcome: "reconciliation-required",
    };
  }
  return { process: cancelled(process), outcome: "cancelled" };
}

export function completeScopeAdmissionCancellation(
  process: ManagedScopeAdmissionProcess,
  receipt: ScopeAdmissionReceipt | null,
): ManagedScopeAdmissionProcess {
  if (process.state !== "cancel-reconcile-required") {
    throw new Error("Only a cancelling uncertain dispatch can be completed.");
  }
  if (receipt === null) {
    return cancelled(process);
  }
  if (receipt.receiptDigest !== process.stepDigest) {
    return blockScopeAdmissionForIntegrity(process);
  }
  if (
    process.receipt !== null &&
    (process.receipt.receiptRef !== receipt.receiptRef ||
      process.receipt.kind !== receipt.kind)
  ) {
    return blockScopeAdmissionForIntegrity(process);
  }
  if (receipt.kind === "conflict") {
    return evolve(process, {
      state: "blocked",
      blockReason: "DOWNSTREAM_CONFLICT",
      dispatchAuthorityBasis: null,
      receipt,
    });
  }
  return evolve(process, {
    state: "blocked",
    blockReason: "USER_CANCELLED",
    dispatchAuthorityBasis: null,
    receipt,
  });
}

export function resumeManagedScopeAdmission(
  process: ManagedScopeAdmissionProcess,
  input: Readonly<{
    creationAuthorityBasis: CreationAuthorityBasisSnapshot;
    requesterRef: TrustedRequesterRef;
    stepCommandId?: ScopeAdmissionStepCommandId;
    stepDigest?: CanonicalCommandDigest;
  }>,
): ManagedScopeAdmissionProcess {
  if (
    process.state !== "blocked" ||
    process.blockReason === "DATA_INTEGRITY_CONFLICT" ||
    process.blockReason === "DOWNSTREAM_CONFLICT"
  ) {
    throw new Error("Scope admission is not safely resumable.");
  }
  const retainsPredecessorReceipt = process.receipt?.kind === "admitted";
  if (
    !retainsPredecessorReceipt &&
    (input.stepCommandId === undefined || input.stepDigest === undefined)
  ) {
    throw new Error("A successor dispatch requires a new command identity.");
  }
  const stepCommandId = retainsPredecessorReceipt
    ? process.stepCommandId
    : input.stepCommandId as ScopeAdmissionStepCommandId;
  const stepDigest = retainsPredecessorReceipt
    ? process.stepDigest
    : input.stepDigest as CanonicalCommandDigest;
  return evolve(process, {
    generation: retainsPredecessorReceipt
      ? process.generation
      : process.generation + 1,
    state: retainsPredecessorReceipt ? "receipt-observed" : "requested",
    stepCommandId,
    stepDigest,
    attemptCount: 0,
    receipt: retainsPredecessorReceipt ? process.receipt : null,
    blockReason: null,
    requesterRef: input.requesterRef,
    creationAuthorityBasis: input.creationAuthorityBasis,
    dispatchAuthorityBasis: null,
    admissionAuthorityBasis: null,
  });
}
