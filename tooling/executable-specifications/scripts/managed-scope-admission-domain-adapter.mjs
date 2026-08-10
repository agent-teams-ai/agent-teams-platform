import {
  domainLostAckCancellationResumeTrace,
  domainReadyTrace,
  domainResumedReadyTrace,
} from "@agent-teams/platform-project-management/testing/model-conformance";

export const domainTraces = Object.freeze({
  lostAckCancellationResume: domainLostAckCancellationResumeTrace,
  ready: domainReadyTrace,
  resumedReady: domainResumedReadyTrace,
});
