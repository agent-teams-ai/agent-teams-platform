export type SafeRetryPolicy = Readonly<{
  defaultDelayMs: number;
  maxDelayMs: number;
  maxAttempts: number;
}>;

export function assertSafeRetryPolicy(policy: SafeRetryPolicy): void {
  if (!Number.isSafeInteger(policy.defaultDelayMs) || policy.defaultDelayMs <= 0) {
    throw new TypeError("Safe retry delay must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(policy.maxAttempts) || policy.maxAttempts <= 0) {
    throw new TypeError("Safe retry attempts must be a positive safe integer.");
  }
  if (
    !Number.isSafeInteger(policy.maxDelayMs) ||
    policy.maxDelayMs < policy.defaultDelayMs
  ) {
    throw new TypeError(
      "Safe retry maximum delay must be a safe integer not below the default delay.",
    );
  }
}

export function safeRetryAt(
  policy: SafeRetryPolicy,
  now: number,
  suggested?: number,
): number {
  const latest = now + policy.maxDelayMs;
  if (!Number.isSafeInteger(latest)) {
    throw new TypeError("Safe retry timestamp exceeds the safe integer range.");
  }
  return suggested !== undefined && Number.isSafeInteger(suggested) && suggested > now
    ? Math.min(suggested, latest)
    : now + policy.defaultDelayMs;
}

export function safeRetryExhausted(
  policy: SafeRetryPolicy,
  attemptCount: number,
): boolean {
  return attemptCount >= policy.maxAttempts;
}
