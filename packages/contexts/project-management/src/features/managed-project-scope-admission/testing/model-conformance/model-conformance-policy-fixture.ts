import { safeRetryExhausted } from "../../application/safe-retry-policy.js";
import { preparationGenerationExhausted } from "../../domain/scope-admission-readiness.js";

export function domainPolicyBoundary(input: {
  maxAttempts: number;
  attemptCount: number;
  maxPreparationGenerations: number;
  generation: number;
  resumptionCount: number;
  retainsAdmittedReceipt: boolean;
}) {
  return Object.freeze({
    attemptExhausted: safeRetryExhausted(
      {
        defaultDelayMs: 1,
        maxDelayMs: 1,
        maxAttempts: input.maxAttempts,
      },
      input.attemptCount,
    ),
    generationExhausted: preparationGenerationExhausted(input),
  });
}
