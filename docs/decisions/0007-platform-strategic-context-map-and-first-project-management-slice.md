---
id: ADR-0007
type: adr
status: accepted
owner: architecture/domain
summary: Accept the Platform strategic Context Map, v1 product contracts, and only the first Project Management slice.
approved_by: product-owner
accepted_at: 2026-08-09
supersedes: []
superseded_by: []
accepts_architecture_documents:
  - domain.context-map
  - domain.product-decision-packet
accepts_product_decisions:
  - PO-PLAT-001
  - PO-PLAT-002
  - PO-PLAT-003
  - PO-PLAT-004
  - PO-PLAT-005
  - PO-PLAT-006
  - PO-PLAT-007
accepts_package_targets:
  - context.project-management
related:
  - ADR-0002
  - ADR-0003
  - ADR-0004
  - ADR-0005
  - architecture.platform-orchestrator-boundary
---

# ADR-0007: Platform Strategic Context Map and First Project Management Slice

## Context

Platform needs stable strategic boundaries before production code appears. It
must support personal and customer ownership, multiple Tenant per customer,
explicit product authority, managed Project creation, commercial restrictions,
and managed deployment without copying Orchestrator or Agent Runtime models.

The proposed Context Map and eight Platform-Orchestrator review artifacts have
been reconciled with the accepted decisions in all three repositories. Seven
remaining product decisions required explicit product-owner confirmation. They
are now confirmed. Package materialization still needs a narrower decision:
accepting a strategic context boundary does not justify an empty package or
unproven tactical aggregate model.

This ADR closes the proposal state previously described as requiring a
"superseding ADR". It does not formally supersede ADR-0002 through ADR-0005;
those decisions remain valid and are refined here.

## Decision

### Strategic Platform contexts

Accept exactly these current Platform bounded-context boundaries:

| Bounded context | Classification | Exclusive responsibility |
| --- | --- | --- |
| Customer Ownership | Supporting | PersonalSpace and CustomerOrganization ownership identity and terminal lifecycle |
| Tenancy | Supporting, security-critical | Tenant isolation, owner binding, admission, lifecycle epoch, and bounded Project retirement fan-out |
| Platform Identity | Supporting, security-critical | Stable Platform principals, external identity bindings, proof-based IdP migration, privacy erasure, and tombstones |
| Access and Authority | Supporting, security-critical | CustomerOrganization membership, Tenant access grants, bounded delegation, revocation, and capability-specific product authority |
| Project Management | Core | ProductProject identity, admission authority, managed scope admission, readiness, and product retirement coordination |
| Commercial Access | Supporting | Commercial agreements, subscriptions, entitlement grants, and exact commercial restrictions |
| Deployment Management | Supporting, strategic enabling | Managed installation intent, placement policy, release policy, desired revision, and signed DeploymentPlan publication |

The Context Map owns relationships and external exclusions. These boundaries do
not create a target count for future contexts. A split or merge still requires a
real difference in language, invariants, lifecycle, consistency, security,
ownership, or evolution.

Strategic acceptance and package maturity are separate:

- all seven boundaries above are accepted;
- only the Project Management owner dossier and package target are accepted for
  materialization by this ADR;
- the other six dossiers remain tactical proposals until each has an accepted
  first vertical slice;
- no empty package, speculative DDD layer, shared domain package, or cross-context
  database relationship is authorized.

### Customer membership and Tenant access

`CustomerOrganizationMembership` and `TenantAccessGrant` are different records.

- Membership describes a human relationship with one CustomerOrganization and
  supports invitations and organization administration.
- Membership alone grants no access to current or future Tenant.
- A human accessing an organization-owned Tenant requires active membership,
  including an explicit guest membership when applicable, plus an exact active
  TenantAccessGrant.
- PersonalSpace has no membership or invitation lifecycle. Its owner acts through
  owner authority; additional principals receive explicit Tenant access.
- Service principals receive Tenant-scoped grants and never organization
  invitations or memberships.
- Invitations carry no authority before acceptance. Email and display name are
  never identity-linking keys.
- Ending membership invalidates dependent grants and delegations without
  deleting historical authorship or audit evidence.
- Normal administration cannot remove the final active organization
  administrator. External disablement of all administrators fails closed and
  enters an audited recovery flow.

### Bounded delegation

V1 permits exactly one delegation edge from an authoritative direct grant.

- Delegation cannot be delegated again and cannot expand source actions, scope,
  audience, validity, or constraints.
- It binds exact subject, actor when distinct, client, audience, resource scope,
  actions, source revision, issue time, expiry, and revocation revision.
- Human and service principals may be delegatees when permitted by the source.
  An OAuth client remains an orthogonal client identity, not a principal.
- Expired or revoked delegation cannot be revived. Renewal creates a successor
  identity from fresh authority evidence.
- Revocation closes new authority-bearing actions but does not claim that an
  already accepted external effect stopped synchronously.

### Asynchronous fail-closed ProductProject creation

`CreateProductProject` is accepted after one owner-local durable transaction,
not after every remote dependency becomes ready.

Before that transaction, the use case obtains current Tenant admission,
create-Project authority, and applicable commercial authority. A required
`denied`, `stale`, `indeterminate`, or `unavailable` result creates no Project.

The successful Project Management transaction atomically commits:

1. `ProductProject(OPEN)`;
2. initial denied `ProjectAdmissionAuthority`;
3. the exact create-command receipt;
4. `ManagedProjectScopeAdmissionProcess` intent generation 1;
5. the integration outbox record that makes post-commit progress durable.

All five records commit or none do. Missing admission authority always means
denied. No Orchestrator, network, broker, filesystem, or provider call occurs in
the transaction.

The accepted response returns `ProductProjectId` and an operation reference.
`PREPARING`, `READY`, and `BLOCKED` are user-facing readiness projections, never
ProductProject lifecycle or mutation authority.

- Orchestrator unavailability after commit leaves the Project `OPEN`, denied,
  and `PREPARING` while retry or reconciliation remains possible.
- Exact command identity plus the same canonical digest replays the original
  receipt. The same identity with different content is a hard conflict.
- Ambiguous downstream acceptance is reconciled by the original command or
  operation identity. Blind replacement commands are forbidden.
- A permanent failure or exhausted retry budget yields a typed `BLOCKED`
  projection with recoverability and allowed actions.
- Cancellation stops new claims for the current process generation, reconciles
  unknown outcomes, and leaves ProductProject `OPEN`, denied, and
  `BLOCKED(reason=USER_CANCELLED)`.
- Resume re-evaluates current preconditions. A cancelled or proven-not-accepted
  dispatch creates generation N+1 with a new step identity; an already admitted
  receipt is re-authorized in generation N without another downstream dispatch.
  Neither path revives a predecessor claim.
- V1 has at most one active primary managed Orchestration-scope binding per
  ProductProject incarnation. Orchestrator runtime bindings are independent.

Project Management owns narrow consumer ports for Tenant admission,
create-ProductProject authority, applicable commercial authority, and managed
Orchestration-scope admission. Exact TypeScript names are tactical. The
Orchestrator provider contract and ACL remain separate follow-up decisions;
tests use contract-respecting fakes and never invent a wire schema.

### Commercial Access boundary

V1 Commercial Access owns only `CommercialAgreement`, `Subscription`,
`EntitlementGrant`, and `CommercialRestriction` candidates. A product offering
or plan may be a versioned reference or snapshot used to issue entitlements; it
is not required to be a separate aggregate.

- Trial is a time-bounded entitlement source.
- Expiry, revocation, or downgrade closes affected Project creation, Run
  admission, queued dispatch, and capability expansion.
- Already dispatched provider work may continue only within its existing AR
  execution lease and deadline; commercial expiry does not claim immediate
  containment.
- Read, export, cancellation, and retirement remain available. Commercial
  restriction does not retire Projects or delete data.
- During commercial-system outage only unexpired versioned evidence may be
  used. After `validUntil`, affected mutations fail closed.
- Expired or denied commercial authority during preparation produces the typed
  `BLOCKED(reason=COMMERCIAL_RESTRICTION)` projection after bounded handling.
- Credits, balances, rating, overage calculation, corrections, invoices,
  payments, taxes, and collections are outside this context and unreserved.
- Standalone profiles have no runtime dependency on Commercial Access.

### Principal migration and privacy

Principal merge and split are unsupported in v1.

- `PlatformPrincipalId` is stable and non-reusable.
- Identity, eligibility, PII, and external-binding lifecycles are orthogonal.
- IdP migration is an explicit proof-based rebinding with source incarnation and
  monotonic binding revision. Email and display name never auto-link identities.
- Re-enabling a disabled principal does not resume Runs or revive grants or
  delegations; fresh authority evaluation is required.
- PII erasure preserves only approved nonidentifying tombstones and historical
  references. Legal hold may retain minimum required PII but grants no authority.

### Owner and Tenant lifecycle

Suspension is a typed reversible restriction. Retirement is a terminal identity
transition. V1 does not support transfer, merge, split, or resurrection of
CustomerOrganization, Tenant, or ProductProject.

- Suspension closes applicable creation, ordinary mutations, and new dispatch.
  It does not delete data, retire identity, cancel every Run, or prove runtime
  containment.
- Resumption removes only the exact restriction revision and reopens authority
  only after required reconciliation and fencing obligations are satisfied.
- CustomerOrganization retirement uses durable preview, explicit irreversible
  confirmation, and bounded Tenant obligations.
- Tenant retirement closes admission first and coordinates bounded
  ProductProject retirement obligations.
- Legal hold may retain physical data after logical retirement but cannot reopen
  authority.
- Disaster recovery with proven authority continuity is recovery, not product
  restoration. Lost continuity creates successor identity or incarnation.

### ProductProject naming

`ProductProjectId` is the only stable Project identity in v1. It is generated by
Platform and never reused after retirement.

`displayName` is mutable, Unicode, non-unique, and never an authorization,
idempotency, lookup-identity, or join key. Duplicate creation is resolved only by
the create command identity and digest.

V1 does not introduce `ProjectKey`, slug aliases, redirects, or name-based
identity migration. A future user-addressable resource key requires a dedicated
API naming ADR covering namespace, normalization, uniqueness, tombstones,
aliases, migration, and reuse.

### Cross-context and external boundaries

- A context owns its aggregates, tables, migrations, inbox, outbox, feeds,
  command receipts, and transaction boundaries.
- Cross-context SQL, repository reuse, shared Unit of Work, domain-entity import,
  and database cascade are forbidden.
- Consumers own narrow ports, local opaque references, stale behavior, timeout,
  and reconciliation policy. Provider DTOs terminate in an ACL.
- Platform does not own Orchestrator Runs, Work, AgentOrganization, messages,
  approvals, operational usage, workspace materialization, runtime bindings, or
  Orchestrator principal identity.
- Platform does not own AR runtime scopes, sessions, operations, permissions,
  credentials, provider effects, fences, containment, or recovery.
- Plans, subscriptions, memberships, Platform principals, and Platform Tenant or
  Project identities never enter AR domain.

## First Implementation Boundary

This ADR authorizes exactly one package target:

```text
target:  context.project-management
path:    packages/contexts/project-management
package: @agent-teams/platform-project-management
feature: managed-project-scope-admission
```

The package must be generated through the pinned Foundation Plan/Apply protocol
and land with implementation, focused tests, Plan, Receipt, accepted owner
dossier, and source-dependency enforcement. Production persistence, transport,
and Orchestrator adapters are not qualified by this ADR.

The first slice may use an in-memory transactional adapter and fake authority or
scope providers for deterministic conformance. Those fakes prove application
semantics only; they do not claim crash durability, database qualification, wire
compatibility, or production readiness.

## Explicitly Deferred

- materialization and tactical aggregate boundaries for the other six contexts;
- Platform Authority API, concrete Managed ACL, and AuthorityProvider SPI;
- Orchestrator scope-admission command, query, receipt, replay, and snapshot wire
  schemas;
- production PostgreSQL persistence, migration, inbox/outbox dispatcher, broker,
  and transport adapters;
- authority freshness and revocation propagation SLO;
- receipt, retry, tombstone, restore, and PITR retention horizons;
- exact readiness vector beyond scope-admission semantics;
- Orchestrator principal topology and public resource representation;
- AR runtime-scope activation, technical grants, and Published Language;
- Dedicated, BYOC, Hybrid, and deployment implementation qualification.

## Consequences

- Platform has an accepted strategic Context Map without speculative package
  proliferation.
- Product semantics are fixed before database schemas and public contracts.
- The first implementation exercises DDD, Clean Architecture, idempotency,
  transaction boundaries, outbox intent, process recovery, and projections.
- External systems remain behind consumer-owned ports and can evolve without
  entering Platform domain.
- Later persistence and transport work must preserve the same application
  semantics through conformance suites rather than changing the domain model.
