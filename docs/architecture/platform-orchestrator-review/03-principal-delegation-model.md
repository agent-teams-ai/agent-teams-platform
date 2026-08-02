---
id: architecture.platform-orchestrator-review.principal-delegation
type: architecture
status: proposed
owner: architecture/authority
summary: Proposed orthogonal principal, actor, client, delegation, and durable Run authority model.
related:
  - architecture.platform-orchestrator-boundary
  - ADR-0003
---

# Principal and Delegation Model

## Orthogonal identities

```text
subject  whose authority is used
actor    who or what actually acts
client   which application carries the request
```

- HumanPrincipal and ServicePrincipal are principals.
- OAuth client is not a principal unless an explicit service-principal binding
  grants that identity.
- `AgentProfileId` is never a principal.
- Email and display name cannot auto-link identities.
- One Platform principal may map to a different tenant-scoped
  `OrchestrationPrincipalId` in each Tenant.
- Principal deletion erases PII while preserving a non-reusable audit tombstone.

## Authority decision envelope

```text
AuthorityDecisionEnvelope<TScope, TResult>
  header
    contractVersion
    decisionId
    authorityRealmRef
    issuerRef
    audience
    issuedAt
    validUntil
    opaqueAuditRef

  callerContext
    subjectPrincipalRef
    actorRef?
    clientRef
    delegationRef?
    delegationRevision?

  authorityScope
    TenantAuthorityScope
      tenantRef
      tenantIncarnation
    | ProjectAuthorityScope
      tenantRef
      productProjectRef
      productProjectIncarnation

  result
    Allowed<TypedConstraints>
    | Denied<TypedReason>
    | Indeterminate<TypedReason>
    | Stale<TypedConflict>
    | Unavailable<TypedAvailability>
```

Action vocabulary, resource details, relevant revisions, constraints, and
reasons belong to capability-specific contracts. Generic JSON, string
capabilities, and universal `limit` fields are forbidden.

## Durable Run authority basis

Recommended proposal:

```text
AuthorityBasisSnapshot
  basisRevision
  authorityRealmRef
  scopeBindingRef + generation
  acceptanceDecisionRef + digest
  acceptedAt

  TenantAutonomousBasis
    tenantPolicyRef
    tenantPolicyRevision

  | SubjectBoundBasis
    orchestrationPrincipalId
    actorRef?
    clientRef
    authorityProof
      DirectGrant(ref, revision, validUntil)
      | Delegation(ref, revision, expiresAt)

LastMileAuthorityEvidence
  evidenceId
  basisRevision
  basisDigest
  expectedRunAuthorityGeneration
  authorityFreshnessVector
  authorityScopeBindingGeneration
  decisionRef + digest
  purpose
  canonicalIntentDigest
  audience
  issuedAt
  validUntil
```

`RunLifetimePolicy.CLIENT_BOUND` independently controls sponsorship and
disconnect. A client connection is never authority. `AuthorityBasisSnapshot` is
immutable; `LastMileAuthorityEvidence` is short-lived and action-specific.
Routine evidence refresh for the same basis, grant or delegation revision,
realm, and scope binding does not create a successor snapshot and does not
advance `RunAuthorityGeneration`. Each dispatch pins one immutable evidence
digest; no mutable `latestEvidence` is authority. A material basis change creates
a successor snapshot and advances the generation through CAS.

## Confirmed subject revocation policy

```text
Run lifecycle remains intact
ACTIVE(generation N, basis A)
  -> SUSPENDED(generation N+1, revoked basis A)
new dispatch is rejected
active operation -> authority cutoff and containment request
enforcement -> ENFORCED | ENFORCEMENT_UNCERTAIN
uncertain effect -> RECONCILING -> SETTLED
eligible new authority -> ACTIVE(generation N+2, successor basis B) through CAS
```

Suspension is not terminal Run cancellation and does not claim that an active
provider effect stopped synchronously. Reauthorization cannot mutate the prior
snapshot or reuse its generation. V1 has no automatic cancellation timeout.
Verified `REVOKED` or `EXPIRED` authority suspends; `STALE`, `INDETERMINATE`, or
`UNAVAILABLE` authority fails closed for new risky actions without claiming a
verified revocation.

## Cutoff fan-out constraints

- The suspension UoW writes one bounded cutoff trigger. It never enumerates an
  unbounded participant or runtime-operation set.
- A durable `RunAuthorityCutoffProcess` discovers active managed runtime bindings
  in bounded batches and creates idempotent per-target cutoff records.
- Per-target enforcement and reconciliation receipts are canonical. Run-level
  enforcement is only their aggregated projection.
- Successor authority generation and dispatch admission are separate. Generation
  N+2 may be active while dispatch remains closed by unresolved enforcement,
  reconciliation, or AR fencing from previous generations.
- Run Orchestration maintains an authoritative subject-to-active-Run index in the
  same transaction that accepts, replaces, or retires an authority basis. A
  rebuildable eventually consistent projection is insufficient for revocation
  fan-out because it can omit a concurrently accepted Run.
- Duplicate or delayed revocation is matched against the exact applicability
  tuple and cannot affect a successor basis.

## Runtime cutoff target rules

- Revoking one Run normally cuts off only the AR RuntimeOperations recorded in
  that Run's authoritative target inventory. Operations belonging to another Run
  remain unaffected.
- Session-wide cutoff is required only when session authority, custody,
  workspace, credential, or provider binding is revoked, or when the adapter
  cannot prove operation-level isolation of execution, output, and effects.
- Scope-wide suspension and disposition are project lifecycle operations, not a
  shortcut for ordinary Run revocation.
- AR operation cutoff is monotonic. Reauthorization creates a new
  RuntimeOperation for new work; it cannot reopen a cut predecessor operation.
- `PROPOSED`: v1 does not share one RuntimeSession across unrelated Runs. Future
  sharing requires an explicit Orchestrator policy plus qualified AR operation-
  isolation, fencing, and provider capabilities.

### Revocation index and cursor semantics

Three independently owned positions must not be conflated:

```text
IngestionCheckpoint
  transport position durably consumed from one authority stream

SemanticRevocationFence
  basis or proof revisions invalid for future admission and dispatch

FanOutScanCheckpoint
  bounded authoritative-index range already materialized as cutoff work
```

- A stream cursor proves transport progress only. It is never authorization
  evidence and cannot independently invalidate an authority basis.
- Numeric `revision <= fence` comparison is legal only for a documented total
  monotonic order inside one source incarnation and exact applicability
  partition. Independent revision dimensions require a typed
  `AuthorityFreshnessVector` or explicit invalidation predicate.
- `SemanticRevocationFence`, Run admission CAS, and the authoritative active
  index share one Run Orchestration persistence authority. Admission reads or
  locks the same partition fence row advanced by revocation ingestion.
- Each index entry binds exact `RunId`, `RunAuthorityGeneration`, basis ID and
  digest, proof kind/reference/revision, scope-binding generation, and source
  incarnation.
- Fan-out advances its own durable scan checkpoint against an explicit snapshot
  boundary and materializes idempotent per-Run suspension work. Repeating an
  unbounded query without a boundary is forbidden.
- Reauthorization, basis replacement, and Run completion close but do not erase
  an old-generation cutoff obligation before its enforcement and reconciliation
  horizon. Tombstoned entries remain available to crash and restore recovery.
- Out-of-order revoke and regrant facts validate source incarnation, ordered
  source position where defined, and exact proof revision. Revocation of basis A
  cannot suspend successor basis B.
- An authority-stream cursor gap or unproven stream completeness fails closed for
  SubjectBound admission and risky dispatch according to the owning freshness
  policy.

## Open decisions

- `OPEN`: maximum delegation depth and whether transitive delegation is allowed.
- `OPEN`: renewal rules and revocation propagation SLO.
- `OPEN`: principal merge/split, legal hold, and PII erasure semantics.
