import {
  domainLostAckCancellationResumeTrace,
  domainAuthorityRecheckExhaustedTrace,
  domainIntegrityConflictTrace,
  domainPolicyBoundary,
  domainReadyTrace,
  domainResumedReadyTrace,
  domainVocabularyEvidence,
} from "@agent-teams/platform-project-management/testing/model-conformance";

export const domainTraces = Object.freeze({
  lostAckCancellationResume: domainLostAckCancellationResumeTrace,
  authorityRecheckExhausted: domainAuthorityRecheckExhaustedTrace,
  integrityConflict: domainIntegrityConflictTrace,
  policyBoundary: domainPolicyBoundary,
  ready: domainReadyTrace,
  resumedReady: domainResumedReadyTrace,
  vocabularyEvidence: domainVocabularyEvidence,
});
