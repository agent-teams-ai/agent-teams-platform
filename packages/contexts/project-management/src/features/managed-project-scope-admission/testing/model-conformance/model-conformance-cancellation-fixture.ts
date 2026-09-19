import {
  authorizeDispatch,
  blockDispatchForAuthority,
  claimDispatch,
  completeScopeAdmissionCancellation,
  observeScopeAdmissionReceipt,
  requestScopeAdmissionCancellation,
  requireReconciliation,
} from "../../domain/managed-scope-admission-process.js";
import { ids } from "../../domain/value-objects.js";
import {
  authorityBasis,
  blockedTrace,
  initialProcess,
} from "./model-conformance-base-fixture.js";

export function domainSafeCancellationTrace() {
  return blockedTrace(requestScopeAdmissionCancellation(initialProcess()).process);
}

export function domainAdmittedReceiptSafeCancellationTrace() {
  let process = authorizeDispatch(claimDispatch(initialProcess()), authorityBasis);
  process = observeScopeAdmissionReceipt(process, {
    kind: "admitted",
    receiptRef: ids.orchestratorReceipt("model-cancel-retained-admitted"),
    receiptDigest: process.stepDigest,
  });
  return blockedTrace(requestScopeAdmissionCancellation(process).process);
}

export function domainBlockedAuthorityCancellationTrace() {
  const blocked = blockDispatchForAuthority(
    claimDispatch(initialProcess()),
    "AUTHORITY_DENIED",
  );
  return blockedTrace(requestScopeAdmissionCancellation(blocked).process);
}

export function domainBlockedRejectedCancellationTrace() {
  let process = authorizeDispatch(claimDispatch(initialProcess()), authorityBasis);
  process = observeScopeAdmissionReceipt(process, {
    kind: "rejected",
    receiptRef: ids.orchestratorReceipt("model-blocked-cancel-rejected"),
    receiptDigest: process.stepDigest,
  });
  return blockedTrace(requestScopeAdmissionCancellation(process).process);
}

function cancellingReconciliationProcess() {
  let process = authorizeDispatch(claimDispatch(initialProcess()), authorityBasis);
  process = requireReconciliation(process);
  return requestScopeAdmissionCancellation(process).process;
}

export function domainReconciledCancellationTrace() {
  return blockedTrace(
    completeScopeAdmissionCancellation(cancellingReconciliationProcess(), null),
  );
}

function domainReconciledReceiptCancellationTrace(
  kind: "admitted" | "rejected" | "stale" | "conflict",
) {
  const process = cancellingReconciliationProcess();
  return blockedTrace(
    completeScopeAdmissionCancellation(process, {
      kind,
      receiptRef: ids.orchestratorReceipt(`model-cancel-${kind}`),
      receiptDigest: process.stepDigest,
    }),
  );
}

export function domainReconciledAdmittedCancellationTrace() {
  return domainReconciledReceiptCancellationTrace("admitted");
}

export function domainReconciledRejectedCancellationTrace() {
  return domainReconciledReceiptCancellationTrace("rejected");
}

export function domainReconciledStaleCancellationTrace() {
  return domainReconciledReceiptCancellationTrace("stale");
}

export function domainReconciledConflictCancellationTrace() {
  return domainReconciledReceiptCancellationTrace("conflict");
}
