import type {
  AuthorityDecision,
  CreationAuthorityPorts,
  ProjectCreationAuthorityQuery,
} from "./ports/creation-authorities.js";
import type { CurrentAuthorityDisposition } from "./ports/project-management-store.js";
import type {
  CreationAuthorityBasisSnapshot,
  CreationAuthorityEvidence,
} from "../domain/creation-authority-basis.js";

export type CreationAuthorityEvaluation =
  | Readonly<{ kind: "allowed"; basis: CreationAuthorityBasisSnapshot }>
  | Readonly<{
      kind: "denied";
      dependency: string;
      reason: string;
    }>
  | Readonly<{
      kind: "unavailable";
      dependency: string;
      reason: string;
      retryAfter?: number;
    }>;

type NamedDecision = Readonly<{
  dependency: CreationAuthorityEvidence["source"];
  decision: AuthorityDecision;
}>;

async function safeDecision(
  dependency: CreationAuthorityEvidence["source"],
  decide: () => Promise<AuthorityDecision>,
): Promise<NamedDecision> {
  try {
    return { dependency, decision: await decide() };
  } catch {
    return {
      dependency,
      decision: {
        kind: "unavailable",
        reason: "AUTHORITY_PORT_FAILURE",
      },
    };
  }
}

function classify(
  decisions: readonly NamedDecision[],
  checkedAt: number,
): CreationAuthorityEvaluation {
  for (const item of decisions) {
    if (item.decision.kind === "denied") {
      return {
        kind: "denied",
        dependency: item.dependency,
        reason: item.decision.reason,
      };
    }
  }
  for (const item of decisions) {
    if (
      item.decision.kind === "allowed" &&
      item.decision.validUntil > checkedAt
    ) {
      continue;
    }
    const reason =
      item.decision.kind === "allowed"
        ? "AUTHORITY_EVIDENCE_EXPIRED"
        : item.decision.reason;
    return {
      kind: "unavailable",
      dependency: item.dependency,
      reason,
      ...(item.decision.kind === "unavailable" &&
      item.decision.retryAfter !== undefined
        ? { retryAfter: item.decision.retryAfter }
        : {}),
    };
  }
  const evidence = decisions.map((item) => {
    if (item.decision.kind !== "allowed") {
      throw new Error("Authority classification lost an unresolved decision.");
    }
    return Object.freeze({
      source: item.dependency,
      evidenceRef: item.decision.evidenceRef,
      revision: item.decision.revision,
      validUntil: item.decision.validUntil,
    });
  }) as unknown as CreationAuthorityBasisSnapshot["evidence"];
  return {
    kind: "allowed",
    basis: Object.freeze({
      checkedAt,
      validUntil: Math.min(...evidence.map((item) => item.validUntil)),
      evidence,
    }),
  };
}

export async function evaluateCreationAuthority(input: {
  ports: CreationAuthorityPorts;
  query: ProjectCreationAuthorityQuery;
  now: () => number;
}): Promise<CreationAuthorityEvaluation> {
  return classify(
    await Promise.all([
      safeDecision("tenant-admission", () =>
        input.ports.tenantAdmission.decide(input.query),
      ),
      safeDecision("project-creation-authority", () =>
        input.ports.projectCreation.decide(input.query),
      ),
      safeDecision("commercial-project-creation", () =>
        input.ports.commercialCreation.decide(input.query),
      ),
    ]),
    input.now(),
  );
}

export function authorityDisposition(
  evaluation: CreationAuthorityEvaluation,
): CurrentAuthorityDisposition {
  if (evaluation.kind === "allowed") {
    return { kind: "allow", basis: evaluation.basis };
  }
  const commercial = evaluation.dependency === "commercial-project-creation";
  return evaluation.kind === "denied"
    ? {
        kind: "deny",
        blockReason: commercial ? "COMMERCIAL_RESTRICTION" : "AUTHORITY_DENIED",
      }
    : {
        kind: "defer",
        exhaustionReason: commercial
          ? "COMMERCIAL_RESTRICTION"
          : "AUTHORITY_RECHECK_EXHAUSTED",
      };
}

export function authorityDispositionAt(
  disposition: CurrentAuthorityDisposition,
  now: number,
): CurrentAuthorityDisposition {
  if (disposition.kind !== "allow" || now < disposition.basis.validUntil) {
    return disposition;
  }
  const commercialExpired = disposition.basis.evidence.some(
    (evidence) =>
      evidence.source === "commercial-project-creation" &&
      evidence.validUntil <= now,
  );
  return {
    kind: "defer",
    exhaustionReason: commercialExpired
      ? "COMMERCIAL_RESTRICTION"
      : "AUTHORITY_RECHECK_EXHAUSTED",
  };
}
