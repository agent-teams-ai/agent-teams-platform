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

## Acceptance map

| Status | Semantic boundary | Acceptance source and limit |
| --- | --- | --- |
| `PROPOSED` | Platform principal kinds, tenant membership, and stable OrchestrationPrincipal binding | Orchestrator OD-012 remains open; no Platform identity ADR accepts the aggregate or wire model |
| `PROPOSED` | Authority decision envelope and capability-specific decision DTOs | Review proposal; exact Platform Authority API and Orchestrator provider SPI remain unaccepted |
| `CONFIRMED` | Subject-bound Run suspension, successor authority basis, and separate Run lifetime policy | Platform ADR-0003 and Orchestrator ADR-0079; exact DTO and aggregate representation remain owner-local |
| `CONFIRMED` | Bounded revocation fan-out, target-specific cutoff, and predecessor barriers | Platform ADR-0003, Orchestrator ADR-0079, AR ADR-0003, and AR ADR-0004 |
| `OPEN` | Delegation depth, renewal, principal privacy lifecycle, and authority propagation SLO | Platform authority decision and Orchestrator OD-012/OD-031 |

## Orthogonal identities

```text
subject  whose authority is used
actor    who or what actually acts
client   which application carries the request
```

- `PROPOSED`: HumanPrincipal and ServicePrincipal are distinct principal kinds.
- `PROPOSED`: OAuth client is not a principal unless an explicit service-principal binding
  grants that identity.
- `PROPOSED`: `AgentProfileId` is not a principal in Orchestrator authority; the
  separation is directionally agreed but has no accepted owning ADR yet.
- `PROPOSED`: Email and display name cannot auto-link identities.
- `PROPOSED`: One Platform principal may map to a different tenant-scoped
  `OrchestrationPrincipalId` in each Tenant.
- `PROPOSED`: Principal retirement should erase or detach PII while preserving a
  non-reusable, non-identifying audit tombstone. Exact legal-hold, erasure, and
  merge/split semantics remain `OPEN` and cannot be inferred from this target.

## Proposed authority decision envelope

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

Platform ADR-0003 confirms the semantic distinction between tenant-autonomous
and subject-bound authority, immutable successor basis, Run authority
generation, and action-specific evidence. The following field names and nesting
remain a proposed representation:

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
Verified revocation, or verified expiry of the direct grant or delegation used
by a `SubjectBoundBasis`, suspends that basis. Expiry of action-specific evidence
only invalidates that evidence. `STALE`, `INDETERMINATE`, or `UNAVAILABLE`
authority fails closed for new risky actions without claiming a verified
revocation.

## Cutoff fan-out constraints

- The suspension UoW writes one bounded cutoff trigger. It never enumerates an
  unbounded participant or runtime-operation set.
- That same Run authority transaction closes target admission, advances the
  authority generation, captures the target-inventory sequence high-water mark,
  records the cutoff trigger and receipt, and appends the outbox. Target
  insertion allocates its sequence and persists its intent through the same
  gate, so no target can commit invisibly across suspension.
- A durable `RunAuthorityCutoffProcess` scans the authoritative Run target
  inventory through its fixed high-water mark in bounded batches and creates
  idempotent per-target cutoff records. A `ManagedRuntimeBinding` alone is not a
  complete target inventory.
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
- Every target exists first under a local target-intent identity with the
  original AR command identity and digest, even before an opaque AR target ref is
  known. Cutoff cannot skip that entry: it recovers the original AR receipt or
  installs the AR negative operation-intent guard when prevention wins first.

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
- `CONFIRMED`: v1 does not share one RuntimeSession across unrelated Runs. Future
  sharing requires an explicit Orchestrator policy plus qualified AR operation-
  isolation, fencing, and provider capabilities. Orchestrator ADR-0079 confirms
  this policy; exact repository mechanics remain open under OD-006.

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

- `OPEN`: exact Platform principal kinds, aggregate boundaries, and authority
  decision wire representation.
- `OPEN`: maximum delegation depth and whether transitive delegation is allowed.
- `OPEN`: renewal rules and revocation propagation SLO.
- `OPEN`: principal merge/split, legal hold, and PII erasure semantics.
