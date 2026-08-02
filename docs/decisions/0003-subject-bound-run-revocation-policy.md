---
id: ADR-0003
type: adr
status: accepted
owner: product/authority
summary: Suspend subject-bound Run authority on verified revocation without conflating revocation, Run cancellation, and runtime enforcement.
approved_by: product-owner
accepted_at: 2026-08-01
---

# ADR-0003: Subject-Bound Run Revocation Policy

## Context

A durable Run may outlive a client connection and may already have active or
ambiguously accepted runtime effects when its subject authority is revoked.
Continuing new work under revoked authority is unsafe, while terminally
cancelling the Run would conflate product cancellation with authorization and
could hide unresolved external effects.

## Decision

A verified applicable revocation or expiry of the direct grant or delegation in
a `SubjectBoundBasis` suspends Run authority but does not automatically cancel or
destroy the Run. Ordinary expiry of action-specific last-mile evidence only
invalidates that evidence and does not suspend the Run.

```text
RunLifecycle
  remains unchanged

RunAuthority
  ACTIVE(generation N, basis A)
    -> SUSPENDED(generation N+1, revoked basis A)

AuthorityEnforcement
  CUTOFF_REQUESTED
    -> ENFORCED
    | ENFORCEMENT_UNCERTAIN

Reconciliation
  NOT_REQUIRED
    | REQUIRED -> RESOLVED

Reauthorization
  SUSPENDED(generation N+1)
    -> ACTIVE(generation N+2, successor basis B)
```

The suspension transaction atomically:

```text
checks the exact current authority generation and basis
records verified revocation evidence
advances RunAuthorityGeneration
sets RunAuthorityState to SUSPENDED
appends one bounded cutoff trigger and its transactional outbox record
commits
```

After that commit, new placements, authority-bearing actions, and runtime
dispatch for the suspended generation are rejected. Active operations receive
technical cutoff and containment requests. An uncertain outcome remains subject
to reconciliation and is never represented as stopped, cancelled, or safe to
retry without evidence.

The accepted product policy is:

- v1 performs no automatic terminal cancellation after a suspension timeout;
- the Run remains suspended until explicit cancellation, retention disposition,
  or reauthorization;
- any newly eligible authority subject may perform reauthorization; it need not
  be the revoked subject;
- reauthorization creates an immutable successor `AuthorityBasisSnapshot` and a
  new generation through CAS; it never mutates or reuses the revoked basis;
- a stale or duplicate revocation for an older generation cannot affect a
  successor generation;
- `TenantAutonomousBasis` is not revoked by disabling one principal;
- client disconnect, OAuth client revocation, and `CLIENT_BOUND` sponsorship loss
  remain separate policies;
- `stale`, `indeterminate`, or `unavailable` authority fails closed for new risky
  actions but does not claim that a verified revocation occurred.

## Ownership boundary

- Platform or Standalone Authority owns the revocation fact.
- Run Orchestration owns Run authority state, generation, suspension, and
  reauthorization policy.
- AR owns technical cutoff, output fencing, containment, runtime-effect
  reconciliation, and enforcement receipts.
- Owning business features decide cancellation and compensation.

There is no distributed transaction across these owners. Exact event schemas,
revocation propagation SLO, partition window, restore fencing, AR commands, and
last-mile enforcement remain owning technical ADR decisions.

## Consequences

- Revocation is fail-closed without pretending that external execution stops
  synchronously.
- Run lifecycle, authority lifecycle, enforcement lifecycle, and reconciliation
  lifecycle remain distinct.
- Every dispatch pins one immutable evidence digest and expected
  `RunAuthorityGeneration`.
- Suspension never enumerates an unbounded participant or runtime-operation set
  inside the Run transaction. A durable cutoff process discovers targets in
  bounded batches and records idempotent per-target outcomes.
- Per-target enforcement and reconciliation receipts are canonical. Any
  Run-level enforcement status is an aggregated projection, not independent
  authority.
- Reauthorization may establish successor authority but cannot alone reopen
  dispatch. Dispatch also requires predecessor-generation enforcement,
  reconciliation, and AR fencing gates to be satisfied.
- The semantic revocation fence and active subject-to-Run authority index share
  the Run Orchestration persistence authority used to accept, replace, and retire
  `AuthorityBasisSnapshot`. A transport ingestion cursor or rebuildable
  eventually consistent projection cannot be the sole revocation safety fence.
- Offline and partitioned profiles require bounded evidence, technical grants,
  execution leases, and explicit reconciliation before new effects.
- Revocation storms require coalescing, bounded process state, and reserved
  safety capacity.

## Rejected alternatives

- Automatically cancelling the Run, which mixes authorization loss with product
  cancellation and does not remove the need for containment or reconciliation.
- Allowing a subject-bound Run to continue new effects after revocation, which
  violates least privilege and effectively changes it into tenant-autonomous
  authority.
- Treating local `SUSPENDED` state as proof that AR or the provider has already
  stopped.
