import type {
  AuthorityDecision,
  ProjectPreparationAuthorityPort,
  ProjectPreparationAuthorityQuery,
} from "./ports/creation-authorities.js";

export type PreparationAuthorityEvaluation =
  | Readonly<{ kind: "allowed"; validUntil: number }>
  | Readonly<{ kind: "denied"; dependency: string; reason: string }>
  | Readonly<{
      kind: "unavailable";
      dependency: string;
      reason: string;
      retryAfter?: number;
    }>;

function classify(decision: AuthorityDecision, now: number): PreparationAuthorityEvaluation {
  if (decision.kind === "allowed") {
    return decision.validUntil > now
      ? { kind: "allowed", validUntil: decision.validUntil }
      : {
          kind: "unavailable",
          dependency: "project-preparation-authority",
          reason: "AUTHORITY_EVIDENCE_EXPIRED",
        };
  }
  if (decision.kind === "denied") {
    return {
      kind: "denied",
      dependency: "project-preparation-authority",
      reason: decision.reason,
    };
  }
  return {
    kind: "unavailable",
    dependency: "project-preparation-authority",
    reason: decision.reason,
    ...(decision.kind === "unavailable" && decision.retryAfter !== undefined
      ? { retryAfter: decision.retryAfter }
      : {}),
  };
}

export async function evaluatePreparationAuthority(input: Readonly<{
  port: ProjectPreparationAuthorityPort;
  query: ProjectPreparationAuthorityQuery;
  now: () => number;
}>): Promise<PreparationAuthorityEvaluation> {
  let decision: AuthorityDecision;
  try {
    decision = await input.port.decide(input.query);
  } catch {
    return {
      kind: "unavailable",
      dependency: "project-preparation-authority",
      reason: "AUTHORITY_PORT_FAILURE",
    };
  }
  return classify(decision, input.now());
}
