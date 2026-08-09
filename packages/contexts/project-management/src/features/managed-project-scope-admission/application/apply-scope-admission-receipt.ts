import {
  blockScopeAdmissionForAuthority,
  blockScopeAdmissionForIntegrity,
  finalizeScopeAdmission,
  observeScopeAdmissionReceipt,
  type ManagedScopeAdmissionProcess,
  type ScopeAdmissionReceipt,
} from "../domain/managed-scope-admission-process.js";
import {
  allowProjectAdmission,
  blockProjectAdmissionForIntegrity,
  type ProjectAdmissionAuthority,
} from "../domain/project-admission-authority.js";
import type { CurrentAuthorityDisposition } from "./ports/project-management-store.js";

export type ScopeAdmissionReceiptTransition = Readonly<{
  process: ManagedScopeAdmissionProcess;
  admission: ProjectAdmissionAuthority;
  integrityConflict: boolean;
}>;

export function applyScopeAdmissionReceipt(input: {
  process: ManagedScopeAdmissionProcess;
  admission: ProjectAdmissionAuthority;
  receipt: ScopeAdmissionReceipt;
  authority: CurrentAuthorityDisposition;
}): ScopeAdmissionReceiptTransition {
  if (input.receipt.receiptDigest !== input.process.stepDigest) {
    return {
      process: blockScopeAdmissionForIntegrity(input.process),
      admission: blockProjectAdmissionForIntegrity(input.admission),
      integrityConflict: true,
    };
  }
  const observed = observeScopeAdmissionReceipt(input.process, input.receipt);
  if (observed.blockReason === "DATA_INTEGRITY_CONFLICT") {
    return {
      process: observed,
      admission: blockProjectAdmissionForIntegrity(input.admission),
      integrityConflict: true,
    };
  }
  if (observed.receipt?.kind !== "admitted") {
    return { process: observed, admission: input.admission, integrityConflict: false };
  }
  if (input.authority.kind === "allow") {
    return {
      process: finalizeScopeAdmission(observed, input.authority.basis),
      admission: allowProjectAdmission(
        input.admission,
        observed.receipt.receiptRef,
      ),
      integrityConflict: false,
    };
  }
  if (input.authority.kind === "deny") {
    return {
      process: blockScopeAdmissionForAuthority(
        observed,
        input.authority.blockReason,
      ),
      admission: input.admission,
      integrityConflict: false,
    };
  }
  return { process: observed, admission: input.admission, integrityConflict: false };
}
