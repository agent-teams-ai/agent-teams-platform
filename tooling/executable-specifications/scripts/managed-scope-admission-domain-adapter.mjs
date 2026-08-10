import {
  domainLostAckCancellationResumeTrace,
  domainAuthorityRecheckExhaustedTrace,
  domainAuthorityRecheckRecoveryTrace,
  domainIntegrityConflictTrace,
  domainPolicyBoundary,
  domainReadyTrace,
  domainResumedReadyTrace,
  domainVocabularyEvidence,
} from "@agent-teams/platform-project-management/testing/model-conformance";

export const domainTraces = Object.freeze({
  lostAckCancellationResume: domainLostAckCancellationResumeTrace,
  authorityRecheckExhausted: domainAuthorityRecheckExhaustedTrace,
  authorityRecheckRecovery: domainAuthorityRecheckRecoveryTrace,
  integrityConflict: domainIntegrityConflictTrace,
  policyBoundary: domainPolicyBoundary,
  ready: domainReadyTrace,
  resumedReady: domainResumedReadyTrace,
  vocabularyEvidence: domainVocabularyEvidence,
});
