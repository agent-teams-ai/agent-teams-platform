import {
  type AggregateRevision,
  type OpaqueOrchestratorReceiptRef,
  type ProductProjectId,
  nextRevision,
} from "./value-objects.js";

export type ProjectAdmissionAuthority = Readonly<{
  projectId: ProductProjectId;
  state: "denied" | "allowed";
  revision: AggregateRevision;
  lifecycleEpoch: number;
  basis:
    | Readonly<{ kind: "initializing" }>
    | Readonly<{ kind: "integrity-conflict" }>
    | Readonly<{
        kind: "managed-scope-admitted";
        receiptRef: OpaqueOrchestratorReceiptRef;
      }>;
}>;

export function denyProjectAdmission(
  projectId: ProductProjectId,
): ProjectAdmissionAuthority {
  return Object.freeze({
    projectId,
    state: "denied",
    revision: 1,
    lifecycleEpoch: 1,
    basis: Object.freeze({ kind: "initializing" }),
  });
}

export function allowProjectAdmission(
  authority: ProjectAdmissionAuthority,
  receiptRef: OpaqueOrchestratorReceiptRef,
): ProjectAdmissionAuthority {
  if (authority.state === "allowed") {
    if (
      authority.basis.kind === "managed-scope-admitted" &&
      authority.basis.receiptRef === receiptRef
    ) {
      return authority;
    }
    throw new Error("Project admission is already allowed by different evidence.");
  }
  return Object.freeze({
    ...authority,
    state: "allowed",
    revision: nextRevision(authority.revision),
    basis: Object.freeze({ kind: "managed-scope-admitted", receiptRef }),
  });
}

export function blockProjectAdmissionForIntegrity(
  authority: ProjectAdmissionAuthority,
): ProjectAdmissionAuthority {
  if (
    authority.state === "denied" &&
    authority.basis.kind === "integrity-conflict"
  ) {
    return authority;
  }
  return Object.freeze({
    ...authority,
    state: "denied",
    revision: nextRevision(authority.revision),
    lifecycleEpoch: authority.lifecycleEpoch + 1,
    basis: Object.freeze({ kind: "integrity-conflict" }),
  });
}
