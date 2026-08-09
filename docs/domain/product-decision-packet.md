---
id: domain.product-decision-packet
type: product-decision-packet
status: accepted
owner: product-owner
summary: Product-owner-confirmed v1 Platform domain semantics accepted by ADR-0007.
owner_decision: ADR-0007
decisions:
  PO-PLAT-001: accepted
  PO-PLAT-002: accepted
  PO-PLAT-003: accepted
  PO-PLAT-004: accepted
  PO-PLAT-005: accepted
  PO-PLAT-006: accepted
  PO-PLAT-007: accepted
related:
  - ADR-0007
  - domain.context-map
  - ADR-0002
  - ADR-0003
  - ADR-0004
  - ADR-0005
---

# Platform Product Decision Packet

This packet separates product policy from tactical implementation. Product owner
accepted all seven recommendations on 2026-08-09. ADR-0007 is the immutable
normative decision; this packet preserves the reviewed rationale and edge cases.

## PO-PLAT-001: Customer Membership and Tenant Access

### Recommendation

Keep organization membership and Tenant access as different authority records.
Membership describes a human relationship with a CustomerOrganization;
`TenantAccessGrant` grants exact capabilities in one Tenant.

### Product Contract

- A CustomerOrganization membership does not implicitly grant access to any
  current or future Tenant.
- A human accessing an organization-owned Tenant requires both an active
  organization membership, including an explicit guest membership when
  applicable, and an active TenantAccessGrant.
- A PersonalSpace owner has owner authority for that PersonalSpace. Additional
  human principals receive explicit TenantAccessGrant records.
- A service principal never receives an invitation or organization membership.
  It receives a separately administered, Tenant-scoped grant.
- An invitation carries no authority before acceptance. Email is a delivery
  address, never a principal-linking key.
- Ending a membership invalidates dependent grants and delegations without
  deleting historical authorship or audit references.
- Normal administration cannot remove the last active organization
  administrator. External disablement of every administrator fails closed and
  enters an audited recovery flow.

### Explicitly Unsupported in V1

- implicit access to all organization-owned Tenants;
- nested groups, transitive role inheritance, or generic role bags;
- service-principal membership and invitation flows;
- identity matching or account linking by email or display name.

### Consequences

Access and Authority owns separate membership and TenantAccessGrant lifecycles.
Tenant consumers receive capability-specific decisions rather than membership
records. Revocation fan-out must retain exact source revisions and dependencies.

### Product-Owner Confirmation

`ACCEPTED_BY_ADR_0006`

## PO-PLAT-002: Delegation Depth and Revocation

### Recommendation

Support one delegation edge from an authoritative direct grant. Delegation
cannot be delegated again. Renewal creates a successor with a new identity and
fresh evidence.

### Product Contract

- A delegation binds an exact subject, actor when distinct, client, audience,
  Tenant/resource scope, actions, source-grant revision, issue time, expiry, and
  revocation revision.
- A delegation may narrow but never expand its source authority.
- Human and service principals may be delegatees when the source grant permits
  that principal kind. An OAuth client is not a principal.
- Expired or revoked delegation cannot be revived. Renewal creates a successor.
- Disablement or revocation closes new authority-bearing actions immediately
  after the applicable freshness boundary. It does not claim that already
  accepted external effects have stopped.
- Durable Runs retain their immutable authority basis and follow the separate
  Run revocation/cutoff policy agreed with Orchestrator.

### Explicitly Unsupported in V1

- delegation chains deeper than one edge;
- redelegation, delegation cycles, or implicit audience widening;
- evergreen delegation without expiry;
- treating client identity, network connection, or API token as subject authority.

### Consequences

The model has bounded revocation fan-out and auditable authority provenance.
Later transitive delegation would require a new product decision, graph-cycle
rules, depth limits, and a migration of decision evidence.

### Product-Owner Confirmation

`ACCEPTED_BY_ADR_0006`

## PO-PLAT-003: Asynchronous ProductProject Creation

### Recommendation

Accept creation after one fail-closed Platform transaction, then prepare the
managed Orchestration scope asynchronously. A Project identity survives setup
failure or cancellation and is removed only through the retirement process.

### Product Contract

- Before commit, Platform verifies current Tenant admission, create-Project
  authority, and applicable commercial authority. An unavailable required
  decision returns a typed unavailable result and creates no ProductProject.
- The successful transaction atomically commits ProductProject, an initial
  denied ProjectAdmissionAuthority, command receipt, scope-admission process
  intent, and outbox record.
- The accepted response returns stable ProductProjectId and OperationRef.
- Orchestrator unavailability after commit does not roll back Project identity.
  The user sees a fail-closed `PREPARING` projection.
- `PREPARING`, `READY`, and `BLOCKED` are user-facing projections, not identity
  lifecycle states or authority.
- `READY` requires complete, current receipts for the active process generation.
  Every later operation still evaluates current Platform and Orchestrator gates.
- Transient retry and unknown-outcome reconciliation remain `PREPARING`.
  Permanent failure or an exhausted retry budget becomes `BLOCKED` with a typed
  reason, recoverability, and allowed actions.
- `CancelPreparation` stops new step claims for the current generation. It does
  not roll back ProductProject or assume that remote effects did not occur.
  Unknown outcomes are reconciled before cancellation completes.
- Cancelled preparation leaves the Project `OPEN`, denied, and
  `BLOCKED(reason=USER_CANCELLED)`. `ResumePreparation` creates a successor
  process generation after current preconditions are re-evaluated.
- Exact command identity plus the same digest replays the original receipt. A
  different digest is a hard conflict. A lost response is recovered by query or
  exact replay, never by issuing a new create identity.
- V1 has at most one active primary managed Orchestration-scope binding per
  ProductProject incarnation. Multiple runtime bindings inside Orchestrator are
  a separate concern.

### Explicitly Unsupported in V1

- synchronous Project creation that waits for every remote dependency;
- distributed rollback of ProductProject identity after remote partial success;
- blind retry after an ambiguous downstream outcome;
- operator `force READY`, manual receipt insertion, or authority repair by SQL;
- shared Platform ProductProject aggregates for standalone deployments.

### Consequences

Users receive a durable identity quickly while all mutations remain fail closed.
Recovery is forward-only and observable. The first vertical slice can prove
transactions, idempotency, outbox dispatch, reconciliation, and projections
without requiring Agent Runtime.

### Product-Owner Confirmation

`ACCEPTED_BY_ADR_0006`

## PO-PLAT-004: Commercial Access Boundary

### Recommendation

Limit v1 Commercial Access to commercial agreements, subscriptions,
entitlement grants, and exact commercial restrictions. Do not reserve billing
or accounting aggregates before their independent language is designed.

### Product Contract

- A product offering or plan is a versioned reference or snapshot used to issue
  entitlements; it is not required to be a standalone aggregate in v1.
- A trial is a time-bounded source of entitlement grants.
- Expiry, revocation, or downgrade closes affected Project creation, Run
  admission, queued dispatch, and capability expansion.
- A provider operation already dispatched under valid authority may finish only
  within its existing AR execution lease and deadline. Commercial expiry does
  not claim immediate runtime containment.
- A restricted customer retains read, export, cancellation, and retirement
  capabilities. Projects are not retired and data is not deleted by commercial
  restriction.
- Downgrade preserves existing resources but blocks further limit expansion.
- During a commercial-system outage, only unexpired versioned evidence may be
  used. After `validUntil`, affected mutations fail closed.
- Commercial outage does not fabricate revocation or clear an existing
  restriction.
- If authority expires during Project preparation, new steps stop and the
  Project becomes `BLOCKED(reason=COMMERCIAL_RESTRICTION)` while staying denied.
- Plan, subscription, invoice, and price names do not cross into Orchestrator or
  Agent Runtime domain.
- Standalone profiles have no runtime dependency on Commercial Access.

### Explicitly Unsupported in V1

- credits, monetary balances, usage rating, overage calculation, corrections;
- invoices, payments, tax, collections, or a generic Billing aggregate;
- Commercial Access as the source of operational usage or runtime quota truth;
- silent fail-open behavior after commercial evidence expires.

### Consequences

Commercial Access remains a narrow supporting context. Future accounting may
be one or several bounded contexts and can consume immutable usage facts without
changing subscription or entitlement ownership.

### Product-Owner Confirmation

`ACCEPTED_BY_ADR_0006`

## PO-PLAT-005: Principal Migration and Privacy

### Recommendation

Do not support principal merge or split in v1. Preserve stable Platform identity
through explicit proof-based IdP rebinding, and separate identity, eligibility,
PII, and external-binding lifecycles.

### Product Contract

- Principal identity progresses from `OPEN` to terminal `TOMBSTONED` and is
  never reused.
- Eligibility is an independent `ENABLED | DISABLED` fact. Re-enabling does not
  resume Runs or revive grants and delegations.
- PII state is independently `PRESENT | ERASED | POLICY_RETAINED`.
- External bindings move through an explicit rebinding process with proof,
  source incarnation, and monotonic binding revision.
- IdP migration preserves authorship and approval references without exposing
  old provider identifiers to consumers.
- Email and display name never auto-link identities.
- Erasure retains only nonidentifying tombstone and audit references required by
  approved retention policy.
- Legal hold may retain minimum required PII but never restores eligibility or
  authority.

### Explicitly Unsupported in V1

- principal merge or split;
- automatic linking by email, display name, or IdP profile similarity;
- deletion that breaks historical authorship, approvals, or audit references;
- administrative rebind without proof and an auditable recovery decision.

### Consequences

Identity history remains stable across IdP changes and privacy operations.
Access and Authority owns the consequences for grants and delegations; Platform
Identity does not mutate another context's records.

### Product-Owner Confirmation

`ACCEPTED_BY_ADR_0006`

## PO-PLAT-006: Owner and Tenant Lifecycle

### Recommendation

Make suspension a typed reversible restriction and retirement terminal. Do not
support transfer, merge, split, or resurrection in v1. Owner retirement uses a
durable, bounded cascade with preview and explicit irreversible confirmation.

### Product Contract

- CustomerOrganization and Tenant identity progress from `OPEN` to terminal
  `RETIRED`; identities, incarnations, and old binding generations are not reused.
- Suspension is not an identity state. Exact restriction records close new
  Tenant/Project creation, ordinary mutations, and new dispatch as applicable.
- Suspension does not delete data, retire resources, cancel every active Run,
  or claim that an already dispatched runtime operation has stopped. Those
  effects require explicit policy-specific cutoff, cancellation, or retirement.
- Resumption removes only the exact restriction revision and reopens authority
  only after required reconciliation and fencing obligations are satisfied.
- CustomerOrganization retirement requires a durable preview, an explicit
  irreversible confirmation, and bounded Tenant obligations.
- Tenant retirement closes admission first and coordinates bounded
  ProductProject retirement obligations. CustomerOrganization retirement waits
  for its Tenant obligations rather than executing an unbounded transaction.
- Legal hold may retain physical records after logical retirement but cannot
  reopen authority.
- Disaster recovery that proves the same authority epoch is recovery, not
  product restoration. Lost continuity creates successor identity/incarnation.

### Explicitly Unsupported in V1

- cross-owner or cross-Tenant transfer;
- CustomerOrganization, Tenant, or ProductProject merge and split;
- resurrection of a retired identity;
- unbounded synchronous cascade deletion;
- suspension as an implicit delete or automatic proof of runtime containment.

### Consequences

Lifecycle remains monotonic and restore-safe. Destructive operations are
recoverable until an explicit terminal commit, then converge through bounded
owner-local processes and receipts.

### Product-Owner Confirmation

`ACCEPTED_BY_ADR_0006`

## PO-PLAT-007: ProductProject Naming

### Recommendation

Use stable, non-reusable ProductProjectId as the only Project identity in the
first slice. `displayName` is mutable, Unicode, non-unique, and never authority.
Defer a user-addressable ProjectKey until API resource naming proves a real need.

### Product Contract

- ProductProjectId is generated by Platform, stable for the Project lifetime,
  and never reused after retirement.
- Display name may change and may duplicate another Project name in the same
  Tenant.
- Duplicate creation is resolved by command idempotency identity and digest,
  never by display name.
- Search and UI disambiguate duplicate names with stable Project identity and
  other non-authoritative context.
- If a future API requires a human-readable ProjectKey, its namespace,
  normalization, uniqueness, tombstone, aliases, migration, and reuse rules
  require a dedicated accepted resource-naming decision.

### Explicitly Unsupported in V1

- display name as identity, idempotency key, authorization scope, or join key;
- uniqueness guarantees for display name;
- user-selected ProjectKey, key rename, aliases, and redirects in the first slice;
- preserving identity through import or standalone-to-managed migration by name.

### Consequences

The first slice avoids freezing a public naming surface before API design. This
does not prevent adding an immutable alternate lookup key later; it prevents an
unproven key from becoming aggregate identity accidentally.

### Product-Owner Confirmation

`ACCEPTED_BY_ADR_0006`
